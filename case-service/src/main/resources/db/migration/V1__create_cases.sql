CREATE TABLE cases (
    case_id UUID PRIMARY KEY,
    applicant_id VARCHAR(100) NOT NULL,
    client_name VARCHAR(200) NOT NULL,
    birth_date DATE NOT NULL,
    permanent_care_need BOOLEAN NOT NULL,
    permanent_supervision BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

