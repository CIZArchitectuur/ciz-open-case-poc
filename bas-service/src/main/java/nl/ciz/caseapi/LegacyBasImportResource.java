package nl.ciz.caseapi;
import java.util.Map;
import jakarta.ws.rs.core.Response;
import nl.ciz.caseapi.generated.bas.api.LegacyImportApi;
public class LegacyBasImportResource implements LegacyImportApi {
    @jakarta.inject.Inject BasResource resource;
    public Response importLegacyBas(Map<String,Object> payload) {return resource.importLegacyBas(payload);}
}
