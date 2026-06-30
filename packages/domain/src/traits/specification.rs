// Specification pattern for complex queries
pub trait Specification<T> {
    fn is_satisfied_by(&self, candidate: &T) -> bool;
    fn and<S: Specification<T>>(self, other: S) -> AndSpecification<Self, S>
    where
        Self: Sized,
    {
        AndSpecification::new(self, other)
    }
    fn or<S: Specification<T>>(self, other: S) -> OrSpecification<Self, S>
    where
        Self: Sized,
    {
        OrSpecification::new(self, other)
    }
}

pub struct AndSpecification<A, B> {
    a: A,
    b: B,
}

impl<A, B> AndSpecification<A, B> {
    pub fn new(a: A, b: B) -> Self {
        Self { a, b }
    }
}

impl<T, A, B> Specification<T> for AndSpecification<A, B>
where
    A: Specification<T>,
    B: Specification<T>,
{
    fn is_satisfied_by(&self, candidate: &T) -> bool {
        self.a.is_satisfied_by(candidate) && self.b.is_satisfied_by(candidate)
    }
}

pub struct OrSpecification<A, B> {
    a: A,
    b: B,
}

impl<A, B> OrSpecification<A, B> {
    pub fn new(a: A, b: B) -> Self {
        Self { a, b }
    }
}

impl<T, A, B> Specification<T> for OrSpecification<A, B>
where
    A: Specification<T>,
    B: Specification<T>,
{
    fn is_satisfied_by(&self, candidate: &T) -> bool {
        self.a.is_satisfied_by(candidate) || self.b.is_satisfied_by(candidate)
    }
}
