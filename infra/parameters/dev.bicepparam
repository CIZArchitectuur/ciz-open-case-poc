using '../bootstrap.bicep'

param environment = 'dev'

// MUST be globally unique across Azure. Fixed once for the CIZ DBM sandbox.
// The GitHub Actions deploy workflow reuses this value by default.
param suffix = 'cizdev42'

// Passed by GitHub Actions / CLI:
// param postgresAdminPassword = ...
