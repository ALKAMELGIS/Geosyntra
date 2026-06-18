use application::{
    authorization::policys::rbac_mapping::map_use_case_to_domain,
    usecases::user::create::CreateUserUseCase,
    usecases::usecase_descriptor::UseCaseDescriptor,
};

#[test]
fn create_user_maps_to_admin_users_manage() {
    let (resource, action) = map_use_case_to_domain(
        CreateUserUseCase::RESOURCE,
        CreateUserUseCase::ACTION,
    )
    .unwrap();
    assert_eq!(resource.resource(), "admin_users");
    assert_eq!(action.action(), "manage");
}
