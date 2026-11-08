package nl.ciz.caseapi;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.*;
import nl.ciz.caseapi.generated.model.*;
@ApplicationScoped
public class DossierAnalysisService {
    private final BasGateway bas;
    private final CaseService cases;
    public DossierAnalysisService(BasGateway bas,CaseService cases) {this.bas=bas;this.cases=cases;}
    public DossierAnalysis start(UUID caseId,Map<String,String> headers) {
        var value=cases.find(caseId).orElseThrow(()->new CaseNotFoundException(caseId));
        if(value.getApplication().getSubmittedAt()==null) throw new jakarta.ws.rs.WebApplicationException("Dien de aanvraag eerst definitief in.",409);
        bas.migrate(caseId);
        return bas.mapper().convertValue(DomainCalls.call(()->bas.api().startImpairmentAnalysis(caseId)),DossierAnalysis.class);
    }
    public List<DossierAnalysis> list(UUID caseId) {
        bas.migrate(caseId);
        return DomainCalls.call(()->bas.api().listImpairmentAnalyses(caseId)).stream().map(row->bas.mapper().convertValue(row,DossierAnalysis.class)).toList();
    }
    public DossierAnalysis review(UUID caseId,UUID id,AnalysisReview review,String actor) {
        bas.migrate(caseId);
        return bas.mapper().convertValue(DomainCalls.call(()->bas.api().reviewImpairmentAnalysis(caseId,id,actor,
                bas.mapper().convertValue(review,nl.ciz.caseapi.generated.bas.model.AnalysisReview.class))),DossierAnalysis.class);
    }
}
