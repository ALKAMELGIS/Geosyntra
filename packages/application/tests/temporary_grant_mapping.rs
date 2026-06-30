use application::{
    authorization::policys::rbac_mapping::map_use_case_to_domain,
    usecases::temporary_grant::CreateTemporaryGrantUseCase,
    usecases::usecase_descriptor::UseCaseDescriptor,
};

#[test]
fn create_temporary_grant_maps_to_admin_roles_assign() {
    let (resource, action) = map_use_case_to_domain(
        CreateTemporaryGrantUseCase::RESOURCE,
        CreateTemporaryGrantUseCase::ACTION,
    )
    .unwrap();
    assert_eq!(resource.resource(), "admin_roles");
    assert_eq!(action.action(), "assign");
}
