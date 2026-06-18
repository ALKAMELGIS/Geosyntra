use application::{
    authorization::policys::rbac_mapping::map_use_case_to_domain,
    usecases::membership::DeleteMembershipUseCase,
    usecases::usecase_descriptor::UseCaseDescriptor,
};

#[test]
fn delete_membership_maps_to_admin_roles_assign() {
    assert_eq!(DeleteMembershipUseCase::RESOURCE, "membership");
    assert_eq!(DeleteMembershipUseCase::ACTION, "delete");
    let (resource, action) =
        map_use_case_to_domain(DeleteMembershipUseCase::RESOURCE, DeleteMembershipUseCase::ACTION)
            .unwrap();
    assert_eq!(resource.resource(), "admin_roles");
    assert_eq!(action.action(), "assign");
}
