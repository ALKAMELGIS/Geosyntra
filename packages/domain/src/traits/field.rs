pub trait Field: Copy + Eq + Send + Sync + 'static {
    /// logical field name
    fn name(&self) -> &'static str;
}
