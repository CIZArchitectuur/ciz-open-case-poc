# Aanvraag, BAS en beoordeling

De cliënt en zorgaanbieder gebruiken dezelfde aanvraagwizard via respectievelijk
`/aanvrager` en `/zorgaanbieder`. Het indieningskanaal wordt bewaard. Zij kunnen
bijlagen toevoegen vóór definitieve indiening en bij een gevraagde aanvulling.
Een gedeelde conceptaanvraag tussen verschillende personen is nog geen
geauthenticeerde samenwerkingsfunctie: beide portalen blijven fictieve demos.

| Eigenaar | Opgeslagen gegevens |
| --- | --- |
| case-service / case-db | Persoon, adres, aanvraag, zaak, workflowreferenties, event-outbox |
| bas-service / bas-db | OCR-versies, bronartefactreferenties, dossieranalyse, bevindingen en broncontroles |
| assessment-service / assessment-db | Beleids- en medische beoordelingen met provenance, besluiten en verzendaudit |
| workflow-start-adapter / workflow-start-db | Kafka-ontvangsten en retry-status voor asynchrone processtart |
| document-service / document-db | Documentmetadata en opslagverwijzingen |
| MinIO | Documentbestanden en OCR-bronartefacten |

Elk domein gebruikt zijn eigen database. De zaakservice biedt de browser een
samenhangend dossier via gegenereerde OpenAPI-clients en interne Kong-routes.
Interne routes zijn niet gepubliceerd door de frontend of op een Kong-hostpoort.
Nieuwe beoordelingen en analyses worden alleen in hun eigen domein opgeslagen.

## Indiening en events

`POST /cases/drafts` slaat een concept op zonder processtart. Bijlagen worden
opgeslagen via de documentservice. `POST /cases/{id}/submit` legt de definitieve
indiening vast en schrijft een ApplicationSubmitted-event in dezelfde lokale
transactie. Een aparte workflow-start-adapter ontvangt dit via Kafka, bewaart een
ontvangstregistratie in zijn eigen database en start Operaton via Kong. BAS
ontvangt hetzelfde event in een onafhankelijke consumentengroep. De endpoint is
idempotent; taken ontstaan asynchroon. Het bestaande
`POST /cases` blijft beschikbaar voor directe indiening zonder bijlagen.

DocumentReceived start direct documentmetadata en OCR van een ontvangen PDF,
ook als de aanvraag nog een concept is. ApplicationSubmitted bevat de definitief
ingediende documentidentificaties en start dossieranalyse nadat de benodigde
uitlezingen gereed zijn. Bijlagen bij een gevraagde aanvulling worden direct
uitgelezen; dossieranalyse wacht totdat de aanvulling is verstuurd.
AO-bijlagen bij een reeds ingediende zaak publiceren een nieuwe ingediende
documentset. Kafka gebruikt de zaak-ID als sleutel; dubbele event-ID's worden
idempotent verwerkt. Correlation-ID en beschikbare tracecontext reizen mee.

BAS legt het werk eerst in zijn eigen database vast. De worker leest de ingediende
PDF's uit en start daarna een dossieranalyse van die documentset. De bestaande
provideradapters bepalen of echte verwerking of een expliciete simulatie draait.
Providerstoringen worden begrensd herprobeerd. Voorstellen worden pas door een
onderzoeker gecontroleerd; zij worden niet automatisch beleidsfeiten.

De aanvraagservice start geen processen, ook niet als iemand taken opvraagt.
De workflow-adapter bewaart één ontvangst per zaak; aanvullingen en dubbele
events starten geen tweede proces. Voor iedere poging controleert hij ook de
Operaton-historie, inclusief afgeronde processen. Ontvangsten worden pas na
databasecommit bevestigd aan Kafka. Operaton-uitval leidt tot maximaal twaalf
pogingen met oplopende wachttijd (30–300 seconden). Uitgeputte ontvangsten
blijven bewaard voor een expliciete beheerretry; zie de adapter-README.
Dit is at-least-once aflevering met deduplicatie, geen distributed exactly-once
transactie tussen PostgreSQL en Operaton. Kafka transporteert de indiening;
BPMN blijft registratie, aanvulling, triage, onderzoek en verzending routeren.

De interne `POST /cases/{id}/runs`-API kan vanuit meerdere processtappen worden
aangeroepen. De aanroeper kiest METADATA, OCR en/of DOSSIER en legt de aanleiding
vast. Een run-ID voorkomt dubbele verwerking. `forceRerun` maakt nieuwe
OCR-versies; eerdere resultaten en broncontroles blijven bewaard. Een
metadata-only run vereist geen volledig dossier. Een dossier-only run wacht op
de benodigde OCR-bronnen. Deze bronvereisten zijn technische voorwaarden;
inhoudelijke compleetheidsbeslissingen blijven afkomstig uit RegelRecht.

## Beleid en leesbare resultaten

`policy-service/.../policies/form-groups.yaml` beschrijft alleen de presentatie
van controles. De beleidsdienst levert groepsnamen, volgorde en beschrijving
mee in het dynamische formulier. RegelRecht bepaalt de vereiste feiten en de
uitkomsten. De frontend groepeert op deze metadata en behoudt individuele
antwoorden en markeringen. OCR-weergave normaliseert regeleinden en ondersteunt
bekende tekstcontainers; onherkenbare JSON krijgt een begrijpelijke melding.
De oorspronkelijke resultaten en bronverwijzingen blijven bewaard.

De werkvoorraad toont alle passende taken. Documenten, beoordelingen en het
dynamische formulier worden pas opgehaald bij het openen van een dossier;
de gebruiker ziet een laadmelding totdat deze gegevens beschikbaar zijn.

## Historie en migratie

Een achtergrondtaak importeert historische BAS- en beoordelingsrecords via
idempotente import-API's en houdt de voltooide overname per zaak bij. Bij toegang
tot een nog niet overgenomen zaak gebeurt dezelfde import meteen. Originele ID's, versies,
tijdstippen, bronrelaties en audits blijven behouden. De historische tabellen in
case-db blijven als herstelkopie aanwezig; nieuwe records worden daar niet
geschreven. Er worden geen bestaande volumes of zaken verwijderd.
Historische technische analysenummers mogen overlappen met in de nieuwe BAS
database uitgegeven nummers; de oorspronkelijke waarde blijft bewaard en de
UUID blijft de unieke identiteit. De sequence wordt na import vooruitgezet.

## Containercontroles

```sh
docker compose up --build
docker compose --profile test run --build --rm contract-tests
docker compose -f compose.yaml -f compose.analysis-test.yaml --profile test run --build --rm integration-tests
docker compose -f compose.yaml -f compose.analysis-test.yaml --profile test run --build --rm ui-tests
```

De nieuwe integratietest controleert dat concepten geen workflow starten,
documentontvangst via Kafka OCR start, definitieve indiening idempotent is,
de dossieranalyse pas na indiening start en metadata-only en gedwongen reruns
de juiste onderdelen en nieuwe versies opleveren.
De bestaande ketentests blijven beleidscontrole, triage, onderzoek, besluit en
verzending controleren. CI gebruikt expliciete simulatie en test geen OCR-kwaliteit.
