package nl.ciz.caseapi;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.*;
import nl.ciz.caseapi.generated.bas.api.DefaultApi;
import org.eclipse.microprofile.rest.client.inject.RestClient;
@ApplicationScoped
public class BasGateway {
    private final DefaultApi api;
    private final ObjectMapper mapper;
    public DefaultApi api() {return api;}
    public ObjectMapper mapper() {return mapper;}
    public BasGateway(@RestClient DefaultApi api,ObjectMapper mapper) {this.api=api;this.mapper=mapper;}
    void migrate(UUID caseId) {
        if(LegacyDomainMigrationEntity.findById(caseId)!=null) return;
        var extractions=DocumentExtractionEntity.list("caseId",caseId);
        var analyses=DossierAnalysisEntity.list("caseId",caseId);
        if(!extractions.isEmpty() || !analyses.isEmpty())
            DomainCalls.call(()->{api.importLegacyBas(Map.of("extractions",extractions,"analyses",analyses));return null;});
    }
}
