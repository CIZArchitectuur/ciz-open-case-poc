package nl.ciz.impairmentanalysis;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;

class AnalysisRoutesTest {
    private final ObjectMapper mapper=new ObjectMapper();
    private final String docs="""
      [{"documentId":"00000000-0000-0000-0000-000000000001","extractionId":"00000000-0000-0000-0000-000000000002",
        "docKey":"first","classificationUnits":[{"unit_id":1,"text":"Fictieve bron A","pages":[1],"subdoc_id":2,"region_ids":[3]}]},
       {"documentId":"00000000-0000-0000-0000-000000000003","extractionId":"00000000-0000-0000-0000-000000000004",
        "docKey":"second","classificationUnits":[{"unit_id":1,"text":"Fictieve bron B","pages":[1],"subdoc_id":1,"region_ids":[4]}]}]
      """;
    private AnalysisRoutes routes() { var r=new AnalysisRoutes();r.version="fixture-v1";r.classifier=Optional.of("RobBERT-checkpoint-test");return r; }
    @Test void preservesDocumentBoundariesZeroAndUnassessed() throws Exception {
        var response=mapper.readTree("""
          {"clientbeeld":{"summary":"Fictief beeld"},"Aanvraag":{"Stoornissen":[
            {"Stoornis":"ADL","Ernst":0,"Uitleg":"Fictief","Zinnen":[{"DocKey":"second","UnitId":1,"Tekst":"Fictieve bron B"}]},
            {"Stoornis":"Geheugen","Ernst":null,"Uitleg":"Niet beoordeeld","Zinnen":[{"DocKey":"first","UnitId":1,"Tekst":"Fictieve bron A"}]}]}}
          """);
        var output=routes().normalize(response,mapper.readTree(docs));
        assertFalse(output.getMock());assertEquals(0,output.getFindings().get(0).getScore());
        assertNull(output.getFindings().get(1).getScore());
        assertEquals("second",output.getFindings().get(0).getSources().get(0).getDocKey());
        assertEquals(4,output.getFindings().get(0).getSources().get(0).getRegionIds().get(0));
        assertEquals(2,output.getSourceUnits().size());assertEquals("Fictief beeld",output.getClientPicture());
    }
    @Test void rejectsUnknownSourceAndOutOfRangeScore() throws Exception {
        var response=mapper.readTree("""
          {"Aanvraag":{"Stoornissen":[{"Stoornis":"ADL","Ernst":2,"Uitleg":"Test",
            "Zinnen":[{"DocKey":"unknown","UnitId":1,"Tekst":"Test"}]}]}}
          """);
        assertThrows(IllegalArgumentException.class,()->routes().normalize(response,mapper.readTree(docs)));
        ((com.fasterxml.jackson.databind.node.ObjectNode)response.path("Aanvraag").path("Stoornissen").get(0)).put("Ernst",5);
        assertThrows(IllegalArgumentException.class,()->routes().normalize(response,mapper.readTree(docs)));
    }
}
