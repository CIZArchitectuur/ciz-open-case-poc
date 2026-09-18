# Editor-scenario's (aanvraag-eerst-corpus): kan de aanvraag in behandeling
# worden genomen? Eén query op artikel 4:5 van de Awb loopt via zes open
# normen door alle zeven wetten — de wet kent haar invullers niet, elke
# aanwijzing meldt zich zélf aan (implements, IoC). Het uitlegspoor in de
# editor toont per open norm wie hem invulde en met welk artikel.
# Spiegel van features/aanvraag-eerst/*.feature (BDD) en tools/demo/run-aanvraag.mjs.
Feature: CIZ-aanvraag — kan de aanvraag in behandeling worden genomen

  # De gelukkige route: alle zes open normen ingevuld, elke laag draagt bij.
  Scenario: Complete aanvraag — cliënt tekent zelf
    Given the calculation date is "2026-06-01"
    Given the following parameters:
      | naam                                                        | waarde |
      | dagtekening_aanvraag_aanwezig                               | true |
      | gewenste_zorg_aanwezig                                      | true |
      | achternaam_aanwezig                                         | true |
      | voorletters_aanwezig                                        | true |
      | bsn_aanwezig                                                | true |
      | geboortedatum_aanwezig                                      | true |
      | straat_aanwezig                                             | true |
      | huisnummer_aanwezig                                         | true |
      | postcode_aanwezig                                           | true |
      | woonplaats_aanwezig                                         | true |
      | land_aanwezig                                               | true |
      | land_anders_aanwezig                                        | false |
      | wie_ondertekend                                             | client |
      | blijvende_fysieke_onmogelijkheid_ondertekenen               | false |
      | acute_zorgvraag_ondertekenen_niet_mogelijk                  | false |
      | aanvraag_vanuit_kloostergemeenschap                         | false |
      | bevestiging_aanvraag_wettelijke_vertegenwoordiging_aanwezig | false |
      | rechterlijke_machtiging_of_ibs_aanwezig                     | false |
      | indicatiesteller_zeker_client_kan_overzien                  | true |
      | eerste_bron_client_kan_overzien                             | false |
      | tweede_bron_client_kan_overzien                             | false |
      | machtigingsformulier_aanwezig                               | false |
      | wie_ondertekende_machtigingsformulier                       | client |
      | heeft_gemachtigde_wlz_aanvraag_ondertekend                  | false |
      | levenstestament_volmacht_of_beschikking_aanwezig            | false |
      | indicatiesteller_zeker_machtiging_overzien                  | false |
      | eerste_bron_machtiging_overzien                             | false |
      | tweede_bron_machtiging_overzien                             | false |
      | heeft_gevolmachtigde_wlz_aanvraag_ondertekend               | false |
      | medische_informatie_aanwezig                                | true |
      | dagtekening_informatie_aanwezig                             | true |
      | diagnosedatum_aanwezig                                      | true |
      | diagnose_handmatig_aanwezig                                 | true |
      | diagnose_nlp_aanwezig                                       | false |
      | diagnose_snomed_gevalideerd                                 | true |
      | informatie_ondertekend_door_ter_zake_kundige                | false |
      | stempel_of_logo_aanwezig                                    | true |
      | herleidbaar_document_aanwezig                               | false |
      | bevoegdheid_ter_zake_kundige                                | huisarts |
      | naam_ter_zake_kundige_aanwezig                              | true |
      | big_nummer_aanwezig                                         | true |
      | agb_code_aanwezig                                           | false |
      | medewerker_acht_ter_zake_kundige_bevoegd                    | false |
      | naam_zorgverzekeraar                                        | cz |
      | polisnummer_aanwezig                                        | true |
      | uitzondering_op_verzekering                                 | false |
    When I evaluate "kan_aanvraag_in_behandeling_worden_genomen" of "algemene_wet_bestuursrecht"
    Then the execution succeeds
    Then output "kan_aanvraag_in_behandeling_worden_genomen" is true

  # De hardheidsclausule uit de Aanwijzing handtekening wint van "niemand tekende".
  Scenario: Acuut opgetreden zorgvraag — niemand tekent, uitzondering geldt
    Given the calculation date is "2026-06-01"
    Given the following parameters:
      | naam                                                        | waarde |
      | dagtekening_aanvraag_aanwezig                               | true |
      | gewenste_zorg_aanwezig                                      | true |
      | achternaam_aanwezig                                         | true |
      | voorletters_aanwezig                                        | true |
      | bsn_aanwezig                                                | true |
      | geboortedatum_aanwezig                                      | true |
      | straat_aanwezig                                             | true |
      | huisnummer_aanwezig                                         | true |
      | postcode_aanwezig                                           | true |
      | woonplaats_aanwezig                                         | true |
      | land_aanwezig                                               | true |
      | land_anders_aanwezig                                        | false |
      | wie_ondertekend                                             | niemand |
      | blijvende_fysieke_onmogelijkheid_ondertekenen               | false |
      | acute_zorgvraag_ondertekenen_niet_mogelijk                  | true |
      | aanvraag_vanuit_kloostergemeenschap                         | false |
      | bevestiging_aanvraag_wettelijke_vertegenwoordiging_aanwezig | false |
      | rechterlijke_machtiging_of_ibs_aanwezig                     | false |
      | indicatiesteller_zeker_client_kan_overzien                  | true |
      | eerste_bron_client_kan_overzien                             | false |
      | tweede_bron_client_kan_overzien                             | false |
      | machtigingsformulier_aanwezig                               | false |
      | wie_ondertekende_machtigingsformulier                       | client |
      | heeft_gemachtigde_wlz_aanvraag_ondertekend                  | false |
      | levenstestament_volmacht_of_beschikking_aanwezig            | false |
      | indicatiesteller_zeker_machtiging_overzien                  | false |
      | eerste_bron_machtiging_overzien                             | false |
      | tweede_bron_machtiging_overzien                             | false |
      | heeft_gevolmachtigde_wlz_aanvraag_ondertekend               | false |
      | medische_informatie_aanwezig                                | true |
      | dagtekening_informatie_aanwezig                             | true |
      | diagnosedatum_aanwezig                                      | true |
      | diagnose_handmatig_aanwezig                                 | true |
      | diagnose_nlp_aanwezig                                       | false |
      | diagnose_snomed_gevalideerd                                 | true |
      | informatie_ondertekend_door_ter_zake_kundige                | false |
      | stempel_of_logo_aanwezig                                    | true |
      | herleidbaar_document_aanwezig                               | false |
      | bevoegdheid_ter_zake_kundige                                | huisarts |
      | naam_ter_zake_kundige_aanwezig                              | true |
      | big_nummer_aanwezig                                         | true |
      | agb_code_aanwezig                                           | false |
      | medewerker_acht_ter_zake_kundige_bevoegd                    | false |
      | naam_zorgverzekeraar                                        | cz |
      | polisnummer_aanwezig                                        | true |
      | uitzondering_op_verzekering                                 | false |
    When I evaluate "kan_aanvraag_in_behandeling_worden_genomen" of "algemene_wet_bestuursrecht"
    Then the execution succeeds
    Then output "kan_aanvraag_in_behandeling_worden_genomen" is true

  # Awb 2:1: vertegenwoordiging, mits machtigingsformulier én begripsvermogen.
  Scenario: Gemachtigde tekent namens de cliënt
    Given the calculation date is "2026-06-01"
    Given the following parameters:
      | naam                                                        | waarde |
      | dagtekening_aanvraag_aanwezig                               | true |
      | gewenste_zorg_aanwezig                                      | true |
      | achternaam_aanwezig                                         | true |
      | voorletters_aanwezig                                        | true |
      | bsn_aanwezig                                                | true |
      | geboortedatum_aanwezig                                      | true |
      | straat_aanwezig                                             | true |
      | huisnummer_aanwezig                                         | true |
      | postcode_aanwezig                                           | true |
      | woonplaats_aanwezig                                         | true |
      | land_aanwezig                                               | true |
      | land_anders_aanwezig                                        | false |
      | wie_ondertekend                                             | gemachtigde |
      | blijvende_fysieke_onmogelijkheid_ondertekenen               | false |
      | acute_zorgvraag_ondertekenen_niet_mogelijk                  | false |
      | aanvraag_vanuit_kloostergemeenschap                         | false |
      | bevestiging_aanvraag_wettelijke_vertegenwoordiging_aanwezig | false |
      | rechterlijke_machtiging_of_ibs_aanwezig                     | false |
      | indicatiesteller_zeker_client_kan_overzien                  | true |
      | eerste_bron_client_kan_overzien                             | false |
      | tweede_bron_client_kan_overzien                             | false |
      | machtigingsformulier_aanwezig                               | true |
      | wie_ondertekende_machtigingsformulier                       | client |
      | heeft_gemachtigde_wlz_aanvraag_ondertekend                  | true |
      | levenstestament_volmacht_of_beschikking_aanwezig            | false |
      | indicatiesteller_zeker_machtiging_overzien                  | true |
      | eerste_bron_machtiging_overzien                             | false |
      | tweede_bron_machtiging_overzien                             | false |
      | heeft_gevolmachtigde_wlz_aanvraag_ondertekend               | false |
      | medische_informatie_aanwezig                                | true |
      | dagtekening_informatie_aanwezig                             | true |
      | diagnosedatum_aanwezig                                      | true |
      | diagnose_handmatig_aanwezig                                 | true |
      | diagnose_nlp_aanwezig                                       | false |
      | diagnose_snomed_gevalideerd                                 | true |
      | informatie_ondertekend_door_ter_zake_kundige                | false |
      | stempel_of_logo_aanwezig                                    | true |
      | herleidbaar_document_aanwezig                               | false |
      | bevoegdheid_ter_zake_kundige                                | huisarts |
      | naam_ter_zake_kundige_aanwezig                              | true |
      | big_nummer_aanwezig                                         | true |
      | agb_code_aanwezig                                           | false |
      | medewerker_acht_ter_zake_kundige_bevoegd                    | false |
      | naam_zorgverzekeraar                                        | cz |
      | polisnummer_aanwezig                                        | true |
      | uitzondering_op_verzekering                                 | false |
    When I evaluate "kan_aanvraag_in_behandeling_worden_genomen" of "algemene_wet_bestuursrecht"
    Then the execution succeeds
    Then output "kan_aanvraag_in_behandeling_worden_genomen" is true

  # De diagnose hoeft niet handmatig te zijn overgenomen, wél SNOMED-gevalideerd.
  Scenario: Diagnose door documentclassificatie (NLP)
    Given the calculation date is "2026-06-01"
    Given the following parameters:
      | naam                                                        | waarde |
      | dagtekening_aanvraag_aanwezig                               | true |
      | gewenste_zorg_aanwezig                                      | true |
      | achternaam_aanwezig                                         | true |
      | voorletters_aanwezig                                        | true |
      | bsn_aanwezig                                                | true |
      | geboortedatum_aanwezig                                      | true |
      | straat_aanwezig                                             | true |
      | huisnummer_aanwezig                                         | true |
      | postcode_aanwezig                                           | true |
      | woonplaats_aanwezig                                         | true |
      | land_aanwezig                                               | true |
      | land_anders_aanwezig                                        | false |
      | wie_ondertekend                                             | client |
      | blijvende_fysieke_onmogelijkheid_ondertekenen               | false |
      | acute_zorgvraag_ondertekenen_niet_mogelijk                  | false |
      | aanvraag_vanuit_kloostergemeenschap                         | false |
      | bevestiging_aanvraag_wettelijke_vertegenwoordiging_aanwezig | false |
      | rechterlijke_machtiging_of_ibs_aanwezig                     | false |
      | indicatiesteller_zeker_client_kan_overzien                  | true |
      | eerste_bron_client_kan_overzien                             | false |
      | tweede_bron_client_kan_overzien                             | false |
      | machtigingsformulier_aanwezig                               | false |
      | wie_ondertekende_machtigingsformulier                       | client |
      | heeft_gemachtigde_wlz_aanvraag_ondertekend                  | false |
      | levenstestament_volmacht_of_beschikking_aanwezig            | false |
      | indicatiesteller_zeker_machtiging_overzien                  | false |
      | eerste_bron_machtiging_overzien                             | false |
      | tweede_bron_machtiging_overzien                             | false |
      | heeft_gevolmachtigde_wlz_aanvraag_ondertekend               | false |
      | medische_informatie_aanwezig                                | true |
      | dagtekening_informatie_aanwezig                             | true |
      | diagnosedatum_aanwezig                                      | true |
      | diagnose_handmatig_aanwezig                                 | false |
      | diagnose_nlp_aanwezig                                       | true |
      | diagnose_snomed_gevalideerd                                 | true |
      | informatie_ondertekend_door_ter_zake_kundige                | false |
      | stempel_of_logo_aanwezig                                    | true |
      | herleidbaar_document_aanwezig                               | false |
      | bevoegdheid_ter_zake_kundige                                | huisarts |
      | naam_ter_zake_kundige_aanwezig                              | true |
      | big_nummer_aanwezig                                         | true |
      | agb_code_aanwezig                                           | false |
      | medewerker_acht_ter_zake_kundige_bevoegd                    | false |
      | naam_zorgverzekeraar                                        | cz |
      | polisnummer_aanwezig                                        | true |
      | uitzondering_op_verzekering                                 | false |
    When I evaluate "kan_aanvraag_in_behandeling_worden_genomen" of "algemene_wet_bestuursrecht"
    Then the execution succeeds
    Then output "kan_aanvraag_in_behandeling_worden_genomen" is true

  # De WET->WET-hop: de Wlz stelt het verzekerd-vereiste dat de Awb openlaat.
  Scenario: Niet vergewist van de Wlz-verzekering
    Given the calculation date is "2026-06-01"
    Given the following parameters:
      | naam                                                        | waarde |
      | dagtekening_aanvraag_aanwezig                               | true |
      | gewenste_zorg_aanwezig                                      | true |
      | achternaam_aanwezig                                         | true |
      | voorletters_aanwezig                                        | true |
      | bsn_aanwezig                                                | true |
      | geboortedatum_aanwezig                                      | true |
      | straat_aanwezig                                             | true |
      | huisnummer_aanwezig                                         | true |
      | postcode_aanwezig                                           | true |
      | woonplaats_aanwezig                                         | true |
      | land_aanwezig                                               | true |
      | land_anders_aanwezig                                        | false |
      | wie_ondertekend                                             | client |
      | blijvende_fysieke_onmogelijkheid_ondertekenen               | false |
      | acute_zorgvraag_ondertekenen_niet_mogelijk                  | false |
      | aanvraag_vanuit_kloostergemeenschap                         | false |
      | bevestiging_aanvraag_wettelijke_vertegenwoordiging_aanwezig | false |
      | rechterlijke_machtiging_of_ibs_aanwezig                     | false |
      | indicatiesteller_zeker_client_kan_overzien                  | true |
      | eerste_bron_client_kan_overzien                             | false |
      | tweede_bron_client_kan_overzien                             | false |
      | machtigingsformulier_aanwezig                               | false |
      | wie_ondertekende_machtigingsformulier                       | client |
      | heeft_gemachtigde_wlz_aanvraag_ondertekend                  | false |
      | levenstestament_volmacht_of_beschikking_aanwezig            | false |
      | indicatiesteller_zeker_machtiging_overzien                  | false |
      | eerste_bron_machtiging_overzien                             | false |
      | tweede_bron_machtiging_overzien                             | false |
      | heeft_gevolmachtigde_wlz_aanvraag_ondertekend               | false |
      | medische_informatie_aanwezig                                | true |
      | dagtekening_informatie_aanwezig                             | true |
      | diagnosedatum_aanwezig                                      | true |
      | diagnose_handmatig_aanwezig                                 | true |
      | diagnose_nlp_aanwezig                                       | false |
      | diagnose_snomed_gevalideerd                                 | true |
      | informatie_ondertekend_door_ter_zake_kundige                | false |
      | stempel_of_logo_aanwezig                                    | true |
      | herleidbaar_document_aanwezig                               | false |
      | bevoegdheid_ter_zake_kundige                                | huisarts |
      | naam_ter_zake_kundige_aanwezig                              | true |
      | big_nummer_aanwezig                                         | true |
      | agb_code_aanwezig                                           | false |
      | medewerker_acht_ter_zake_kundige_bevoegd                    | false |
      | naam_zorgverzekeraar                                        | onbekend |
      | polisnummer_aanwezig                                        | true |
      | uitzondering_op_verzekering                                 | false |
    When I evaluate "kan_aanvraag_in_behandeling_worden_genomen" of "algemene_wet_bestuursrecht"
    Then the execution succeeds
    Then output "kan_aanvraag_in_behandeling_worden_genomen" is false

  # De diepste hop: uitvoeringsbeleid dat uitvoeringsbeleid invult (P1, hard vereist).
  Scenario: Diagnose door een niet-bevoegde professional
    Given the calculation date is "2026-06-01"
    Given the following parameters:
      | naam                                                        | waarde |
      | dagtekening_aanvraag_aanwezig                               | true |
      | gewenste_zorg_aanwezig                                      | true |
      | achternaam_aanwezig                                         | true |
      | voorletters_aanwezig                                        | true |
      | bsn_aanwezig                                                | true |
      | geboortedatum_aanwezig                                      | true |
      | straat_aanwezig                                             | true |
      | huisnummer_aanwezig                                         | true |
      | postcode_aanwezig                                           | true |
      | woonplaats_aanwezig                                         | true |
      | land_aanwezig                                               | true |
      | land_anders_aanwezig                                        | false |
      | wie_ondertekend                                             | client |
      | blijvende_fysieke_onmogelijkheid_ondertekenen               | false |
      | acute_zorgvraag_ondertekenen_niet_mogelijk                  | false |
      | aanvraag_vanuit_kloostergemeenschap                         | false |
      | bevestiging_aanvraag_wettelijke_vertegenwoordiging_aanwezig | false |
      | rechterlijke_machtiging_of_ibs_aanwezig                     | false |
      | indicatiesteller_zeker_client_kan_overzien                  | true |
      | eerste_bron_client_kan_overzien                             | false |
      | tweede_bron_client_kan_overzien                             | false |
      | machtigingsformulier_aanwezig                               | false |
      | wie_ondertekende_machtigingsformulier                       | client |
      | heeft_gemachtigde_wlz_aanvraag_ondertekend                  | false |
      | levenstestament_volmacht_of_beschikking_aanwezig            | false |
      | indicatiesteller_zeker_machtiging_overzien                  | false |
      | eerste_bron_machtiging_overzien                             | false |
      | tweede_bron_machtiging_overzien                             | false |
      | heeft_gevolmachtigde_wlz_aanvraag_ondertekend               | false |
      | medische_informatie_aanwezig                                | true |
      | dagtekening_informatie_aanwezig                             | true |
      | diagnosedatum_aanwezig                                      | true |
      | diagnose_handmatig_aanwezig                                 | true |
      | diagnose_nlp_aanwezig                                       | false |
      | diagnose_snomed_gevalideerd                                 | true |
      | informatie_ondertekend_door_ter_zake_kundige                | false |
      | stempel_of_logo_aanwezig                                    | true |
      | herleidbaar_document_aanwezig                               | false |
      | bevoegdheid_ter_zake_kundige                                | geen |
      | naam_ter_zake_kundige_aanwezig                              | true |
      | big_nummer_aanwezig                                         | true |
      | agb_code_aanwezig                                           | false |
      | medewerker_acht_ter_zake_kundige_bevoegd                    | false |
      | naam_zorgverzekeraar                                        | cz |
      | polisnummer_aanwezig                                        | true |
      | uitzondering_op_verzekering                                 | false |
    When I evaluate "kan_aanvraag_in_behandeling_worden_genomen" of "algemene_wet_bestuursrecht"
    Then the execution succeeds
    Then output "kan_aanvraag_in_behandeling_worden_genomen" is false
