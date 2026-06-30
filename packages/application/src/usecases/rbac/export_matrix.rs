use std::sync::Arc;

use domain::tenant::environment::Environment;

use crate::{
    authorization::{authorize_use_case, AuthorizationParams, ports::AuthorizationService},
    error::AppResult,
    rbac::matrix_export::{permissions_matrix_export, MatrixRoleExport},
    usecases::usecase_descriptor::UseCaseDescriptor,
    SubjectContext,
};

/// Export static RBAC matrix (Express `GET /api/rbac/permissions/matrix`).
pub struct ExportPermissionsMatrixUseCase {
    auth: Arc<dyn AuthorizationService>,
}

impl ExportPermissionsMatrixUseCase {
    pub fn new(auth: Arc<dyn AuthorizationService>) -> Self {
        Self { auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
    ) -> AppResult<Vec<MatrixRoleExport>> {
        let params = AuthorizationParams::new(&ctx, environment)
            .with_resource_tenant_id(ctx.tenant_id());
        authorize_use_case::<Self>(self.auth.as_ref(), &params)?;
        Ok(permissions_matrix_export())
    }
}

impl UseCaseDescriptor for ExportPermissionsMatrixUseCase {
    const NAME: &'static str = "export_permissions_matrix";
    const RESOURCE: &'static str = "role";
    const ACTION: &'static str = "list";
    const AUDIT: bool = false;
}
