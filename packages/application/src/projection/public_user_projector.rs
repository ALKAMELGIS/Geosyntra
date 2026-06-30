use crate::{
    authorization::access_descriptor::AccessControl,
    dto::auth::PublicUserView,
    projection::fields::auth::PublicUserField,
};

pub struct PublicUserProjector;

impl PublicUserProjector {
    pub fn apply_access(view: &mut PublicUserView, access: &AccessControl<PublicUserField>) {
        if !access.can_read {
            *view = PublicUserView::default();
            return;
        }

        let readable = &access.readable_fields;
        if !readable.contains(&PublicUserField::Id) {
            view.id = None;
        }
        if !readable.contains(&PublicUserField::Email) {
            view.email = None;
        }
        if !readable.contains(&PublicUserField::Name) {
            view.name = None;
        }
        if !readable.contains(&PublicUserField::Role) {
            view.role = None;
        }
        if !readable.contains(&PublicUserField::RoleSlug) {
            view.role_slug = None;
        }
        if !readable.contains(&PublicUserField::Status) {
            view.status = None;
        }
    }

    pub fn present(mut view: PublicUserView, access: &AccessControl<PublicUserField>) -> PublicUserView {
        Self::apply_access(&mut view, access);
        view
    }
}
