package nl.ciz.caseapi;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.UUID;
import nl.ciz.caseapi.generated.model.*;
@ApplicationScoped
public class DocumentExtractionService {
    private final BasGateway bas;
    private final CaseService cases;
    public DocumentExtractionService(BasGateway bas,CaseService cases) {this.bas=bas;this.cases=cases;}
    private void requireSubmitted(UUID caseId) {
        var value=cases.find(caseId).orElseThrow(()->new CaseNotFoundException(caseId));
        if(value.getApplication().getSubmittedAt()==null) throw new jakarta.ws.rs.WebApplicationException("Dien de aanvraag eerst definitief in.",409);
        bas.migrate(caseId);
    }
    public DocumentExtraction start(UUID caseId,UUID documentId) {
        requireSubmitted(caseId);
        return bas.mapper().convertValue(DomainCalls.call(()->bas.api().startDocumentStructuring(caseId,documentId)),DocumentExtraction.class);
    }
    public DocumentExtraction get(UUID caseId,UUID documentId) {
        bas.migrate(caseId);
        return bas.mapper().convertValue(DomainCalls.call(()->bas.api().getDocumentStructuring(caseId,documentId)),DocumentExtraction.class);
    }
    public DocumentExtraction review(UUID caseId,UUID documentId,DocumentReview review,String actor) {
        requireSubmitted(caseId);
        return bas.mapper().convertValue(DomainCalls.call(()->bas.api().reviewDocumentStructuring(caseId,documentId,actor,
                bas.mapper().convertValue(review,nl.ciz.caseapi.generated.bas.model.DocumentReview.class))),DocumentExtraction.class);
    }
}
