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
    private final CaseService service;
    private final AddressValidationGateway addressValidation;

    public CaseResource(CaseService service, AddressValidationGateway addressValidation) {
        this.service = service;
        this.addressValidation = addressValidation;
    }

    @Override
    public Response createCase(CreateCaseRequest request) {
        var created = service.create(request);
        return Response.created(URI.create("/cases/" + created.getCaseId())).entity(created).build();
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
    @RolesAllowed("ciz-medewerker")
    public Response addCaseDocument(UUID caseId, String fileName, String contentType, File body) {
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
    @RolesAllowed({"ciz-medewerker", "beoordelaar"})
    public Response listCasePolicyEvaluations(UUID caseId) {
        return Response.ok(service.policyEvaluations(caseId)).build();
    }

    @Override
    @RolesAllowed({"ciz-medewerker", "beoordelaar"})
    public Response listCaseMedicalAssessments(UUID caseId) {
        return Response.ok(service.medicalAssessments(caseId)).build();
    }
}
