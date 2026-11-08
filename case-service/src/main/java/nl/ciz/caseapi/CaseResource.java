package nl.ciz.caseapi;

import jakarta.ws.rs.core.Response;
import jakarta.annotation.security.PermitAll;
import jakarta.annotation.security.RolesAllowed;
import java.net.URI;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import nl.ciz.caseapi.generated.api.CasesApi;
import nl.ciz.caseapi.generated.model.CreateCaseRequest;
import nl.ciz.caseapi.generated.model.AddressValidationRequest;
import nl.ciz.caseapi.generated.model.ApplicantSupplementRequest;

@PermitAll
public class CaseResource implements CasesApi {
    @jakarta.inject.Inject DocumentExtractionService extraction;
    @jakarta.inject.Inject org.eclipse.microprofile.jwt.JsonWebToken accessToken;
    @jakarta.inject.Inject io.quarkus.security.identity.SecurityIdentity identity;
    @jakarta.inject.Inject DossierAnalysisService analysis;
    @jakarta.ws.rs.core.Context jakarta.ws.rs.core.HttpHeaders requestHeaders;

    @Override @RolesAllowed("beoordelaar")
    public Response startImpairmentAnalysis(UUID caseId) {
        var headers=new java.util.HashMap<String,String>();
        for(var name:new String[]{"traceparent","tracestate","X-Correlation-ID"}) {
            var value=requestHeaders.getHeaderString(name);
            if(value!=null && value.length()<=512) headers.put(name,value);
        }
        headers.putIfAbsent("X-Correlation-ID",UUID.randomUUID().toString());
        return Response.accepted(analysis.start(caseId,headers)).build();
    }
    @Override @RolesAllowed("beoordelaar")
    public Response listImpairmentAnalyses(UUID caseId) { return Response.ok(analysis.list(caseId)).build(); }
    @Override @RolesAllowed("beoordelaar")
    public Response reviewImpairmentAnalysis(UUID caseId,UUID analysisId,nl.ciz.caseapi.generated.model.AnalysisReview review) {
        return Response.ok(analysis.review(caseId,analysisId,review,accessToken.getSubject())).build();
    }

    @Override @RolesAllowed("beoordelaar")
    public Response startDocumentStructuring(UUID caseId, UUID documentId) {
        return Response.accepted(extraction.start(caseId,documentId)).build();
    }
    @Override @RolesAllowed({"ciz-medewerker","beoordelaar"})
    public Response getDocumentStructuring(UUID caseId, UUID documentId) {
        return Response.ok(extraction.get(caseId,documentId)).build();
    }
    @Override @RolesAllowed("beoordelaar")
    public Response reviewDocumentStructuring(UUID caseId, UUID documentId, nl.ciz.caseapi.generated.model.DocumentReview review) {
        return Response.ok(extraction.review(caseId,documentId,review,accessToken.getSubject())).build();
    }
    private final CaseService service;
    private final AddressValidationGateway addressValidation;
    @jakarta.inject.Inject BasGateway bas;
    @Override @RolesAllowed({"ciz-medewerker","beoordelaar"})
    public Response listCaseBasRuns(UUID caseId) {
        service.find(caseId).orElseThrow(()->new CaseNotFoundException(caseId));
        return Response.ok(DomainCalls.call(()->bas.api().listBasRuns(caseId))).build();
    }

    public CaseResource(CaseService service, AddressValidationGateway addressValidation) {
        this.service = service;
        this.addressValidation = addressValidation;
    }

    @Override
    @RolesAllowed({"ciz-medewerker", "beoordelaar"})
    public Response listCases() { return Response.ok(service.listCases()).build(); }

    @Override
    public Response createCase(CreateCaseRequest request) {
        if(request.getSubmissionChannel()==CreateCaseRequest.SubmissionChannelEnum.POST && !identity.hasRole("beoordelaar"))
            throw new jakarta.ws.rs.ForbiddenException("Postaanvragen worden geregistreerd door de Onderzoeker.");
        var created = service.create(request);
        return Response.created(URI.create("/cases/" + created.getCaseId())).entity(created).build();
    }

    @Override
    public Response createCaseDraft(CreateCaseRequest request) {
        if (request.getSubmissionChannel() == CreateCaseRequest.SubmissionChannelEnum.POST && !identity.hasRole("beoordelaar"))
            throw new jakarta.ws.rs.ForbiddenException("Postaanvragen worden geregistreerd door de Onderzoeker.");
        return Response.status(201).entity(service.createDraft(request)).build();
    }

    @Override
    public Response submitCase(UUID caseId, String xCorrelationId) {
        return Response.ok(service.submit(caseId, xCorrelationId)).build();
    }

    @Override
    public Response validateAddress(AddressValidationRequest request) {
        return Response.ok(addressValidation.validate(request)).build();
    }

    @Override
    public Response getCase(UUID caseId) {
        var found = service.find(caseId).orElseThrow(() -> new CaseNotFoundException(caseId));
        return Response.ok(found).build();
    }

    @Override
    public Response getCaseStatus(UUID caseId) {
        var found = service.status(caseId).orElseThrow(() -> new CaseNotFoundException(caseId));
        return Response.ok(found).build();
    }

    @Override
    public Response addCaseDocument(UUID caseId, String fileName, String contentType, File body) {
        var value = service.find(caseId).orElseThrow(() -> new CaseNotFoundException(caseId));
        if ("POST".equals(value.getApplication().getSubmissionChannel().toString()) && !identity.hasRole("ciz-medewerker"))
            throw new jakarta.ws.rs.ForbiddenException("Postbijlagen worden toegevoegd door AO.");
        if (!identity.hasRole("ciz-medewerker") && !identity.hasRole("beoordelaar")
                && value.getApplication().getSubmittedAt() != null
                && !"WAITING_FOR_DOCUMENTS".equals(value.getApplication().getApplicantStatus().toString()))
            throw new jakarta.ws.rs.ForbiddenException("Bijlagen toevoegen kan vóór indiening of bij een gevraagde aanvulling.");
        var document = service.addDocument(caseId, fileName, contentType, body);
        return Response.created(URI.create("/cases/" + caseId + "/documents/" + document.getDocumentId()))
                .entity(document).build();
    }

    @Override
    @RolesAllowed({"ciz-medewerker", "beoordelaar"})
    public Response listCaseDocuments(UUID caseId) {
        return Response.ok(service.listDocuments(caseId)).build();
    }

    @Override
    @RolesAllowed({"ciz-medewerker", "beoordelaar"})
    public Response downloadCaseDocument(UUID caseId, UUID documentId) {
        var content = service.downloadDocument(caseId, documentId);
        var safeName = content.fileName().replace("\"", "");
        var encoded = java.net.URLEncoder.encode(content.fileName(), StandardCharsets.UTF_8).replace("+", "%20");
        return Response.ok(content.file(), content.contentType())
                .header("Content-Disposition", "attachment; filename=\"" + safeName
                        + "\"; filename*=UTF-8''" + encoded).build();
    }

    @Override
    public Response listCaseTasks(UUID caseId) {
        return Response.ok(service.listTasks(caseId)).build();
    }

    @Override
    public Response provideApplicantSupplement(UUID caseId, ApplicantSupplementRequest request, String xCorrelationId) {
        return Response.ok(service.provideApplicantSupplement(caseId, request, xCorrelationId)).build();
    }

    @Override
    @RolesAllowed("beoordelaar")
    public Response listCasePolicyEvaluations(UUID caseId) {
        return Response.ok(service.policyEvaluations(caseId)).build();
    }

    @Override
    @RolesAllowed("beoordelaar")
    public Response listCaseMedicalAssessments(UUID caseId) {
        return Response.ok(service.medicalAssessments(caseId)).build();
    }
}
