package nl.ciz.caseapi;
import java.util.Map;
import jakarta.ws.rs.core.Response;
import nl.ciz.caseapi.generated.api.LegacyImportApi;
public class LegacyAssessmentImportResource implements LegacyImportApi {
    @jakarta.inject.Inject AssessmentResource resource;
    public Response importLegacyAssessment(Map<String,Object> payload) {return resource.importLegacyAssessment(payload);}
}
