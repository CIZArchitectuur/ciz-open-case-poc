package nl.ciz.caseapi;

/** Normalize upstream failures without exposing bodies containing dossier data. */
final class DomainCalls {
    @FunctionalInterface interface Request<T> {T execute() throws Exception;}
    static <T> T call(Request<T> request) {
        try{return request.execute();}
        catch(nl.ciz.caseapi.generated.bas.api.ApiException failure) {
            throw problem(failure.getResponse()==null?503:failure.getResponse().getStatus());
        }
        catch(nl.ciz.caseapi.generated.assessment.api.ApiException failure) {
            throw problem(failure.getResponse()==null?503:failure.getResponse().getStatus());
        }
        catch(jakarta.ws.rs.WebApplicationException failure) {throw problem(failure.getResponse().getStatus());}
        catch(Exception failure){
            org.jboss.logging.Logger.getLogger(DomainCalls.class).warnf("Domain request failed (%s)",failure.getClass().getSimpleName());
            throw problem(503);
        }
    }
    private static jakarta.ws.rs.WebApplicationException problem(int status) {
        return new jakarta.ws.rs.WebApplicationException("Dossierdienst is tijdelijk niet beschikbaar of de bewerking is niet toegestaan.",status>=500?503:status);
    }
}
