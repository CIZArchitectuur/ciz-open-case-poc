CREATE TABLE persons (
    person_id UUID PRIMARY KEY,
    citizen_service_number VARCHAR(9) NOT NULL,
    client_name VARCHAR(200) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    initials VARCHAR(20) NOT NULL,
    birth_date DATE NOT NULL,
    migration_case_id UUID UNIQUE
);

ALTER TABLE cases ADD COLUMN person_id UUID;

INSERT INTO persons (person_id, citizen_service_number, client_name, last_name, initials, birth_date)
SELECT gen_random_uuid(), citizen_service_number, client_name, last_name, initials, birth_date
FROM (
    SELECT DISTINCT ON (citizen_service_number)
        citizen_service_number, client_name, last_name, initials, birth_date
    FROM cases
    WHERE citizen_service_number <> ''
    ORDER BY citizen_service_number, created_at, case_id
) earliest;

UPDATE cases AS c SET person_id = p.person_id
FROM persons AS p
WHERE c.citizen_service_number <> '' AND c.citizen_service_number = p.citizen_service_number;

INSERT INTO persons (person_id, citizen_service_number, client_name, last_name, initials, birth_date, migration_case_id)
SELECT gen_random_uuid(), citizen_service_number, client_name, last_name, initials, birth_date, case_id
FROM cases WHERE person_id IS NULL;

UPDATE cases AS c SET person_id = p.person_id
FROM persons AS p WHERE c.case_id = p.migration_case_id;

ALTER TABLE persons DROP COLUMN migration_case_id;
CREATE UNIQUE INDEX persons_bsn_unique ON persons (citizen_service_number)
    WHERE citizen_service_number <> '';

CREATE TABLE addresses (
    address_id UUID PRIMARY KEY,
    person_id UUID NOT NULL REFERENCES persons(person_id),
    street VARCHAR(120) NOT NULL,
    house_number VARCHAR(20) NOT NULL,
    postal_code VARCHAR(12) NOT NULL,
    city VARCHAR(120) NOT NULL,
    country VARCHAR(80) NOT NULL
);

ALTER TABLE cases ADD COLUMN address_id UUID;
INSERT INTO addresses (address_id, person_id, street, house_number, postal_code, city, country)
SELECT gen_random_uuid(), person_id, street, house_number, postal_code, city, country
FROM cases;
UPDATE cases AS c SET address_id = a.address_id
FROM addresses AS a
WHERE c.person_id = a.person_id AND c.street = a.street
  AND c.house_number = a.house_number AND c.postal_code = a.postal_code
  AND c.city = a.city AND c.country = a.country AND c.address_id IS NULL;

CREATE TABLE applications (
    application_id UUID PRIMARY KEY,
    case_id UUID NOT NULL UNIQUE REFERENCES cases(case_id),
    applicant_id VARCHAR(100) NOT NULL,
    permanent_care_need BOOLEAN NOT NULL,
    permanent_supervision BOOLEAN NOT NULL,
    applicant_role VARCHAR(40) NOT NULL,
    signed_by VARCHAR(60) NOT NULL,
    authorization_signed_by_client BOOLEAN,
    submitted_at TIMESTAMP WITH TIME ZONE NOT NULL
);

INSERT INTO applications (application_id, case_id, applicant_id, permanent_care_need,
                          permanent_supervision, applicant_role, signed_by,
                          authorization_signed_by_client, submitted_at)
SELECT gen_random_uuid(), case_id, applicant_id, permanent_care_need, permanent_supervision,
       applicant_role, signed_by, authorization_signed_by_client, created_at
FROM cases;

ALTER TABLE cases ALTER COLUMN person_id SET NOT NULL;
ALTER TABLE cases ALTER COLUMN address_id SET NOT NULL;
ALTER TABLE cases ADD CONSTRAINT cases_person_id_fkey FOREIGN KEY (person_id) REFERENCES persons(person_id);
ALTER TABLE cases ADD CONSTRAINT cases_address_id_fkey FOREIGN KEY (address_id) REFERENCES addresses(address_id);
CREATE INDEX cases_person_id_created_at_idx ON cases (person_id, created_at DESC);
CREATE INDEX addresses_person_id_idx ON addresses (person_id);

ALTER TABLE cases DROP COLUMN applicant_id, DROP COLUMN client_name, DROP COLUMN last_name,
    DROP COLUMN initials, DROP COLUMN citizen_service_number, DROP COLUMN birth_date,
    DROP COLUMN street, DROP COLUMN house_number, DROP COLUMN postal_code,
    DROP COLUMN city, DROP COLUMN country, DROP COLUMN permanent_care_need,
    DROP COLUMN permanent_supervision, DROP COLUMN applicant_role, DROP COLUMN signed_by,
    DROP COLUMN authorization_signed_by_client;
