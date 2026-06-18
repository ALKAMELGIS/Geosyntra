use application::{error::AppError, error::AppResult, ports::PasswordHasher};

pub struct BcryptPasswordHasher {
    cost: u32,
}

impl Default for BcryptPasswordHasher {
    fn default() -> Self {
        Self { cost: 12 }
    }
}

impl BcryptPasswordHasher {
    pub fn new(cost: u32) -> Self {
        Self { cost }
    }

    fn verify_legacy_sha256(hash: &str, password: &str) -> bool {
        use sha2::{Digest, Sha256};
        if hash.len() != 64 || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
            return false;
        }
        let digest = Sha256::digest(password.as_bytes());
        let hex = digest.iter().map(|b| format!("{b:02x}")).collect::<String>();
        hex == hash.to_ascii_lowercase()
    }
}

#[async_trait::async_trait]
impl PasswordHasher for BcryptPasswordHasher {
    fn verify(&self, hash: &str, password: &str) -> bool {
        let hash = hash.trim();
        if hash.starts_with("$2") {
            return bcrypt::verify(password, hash).unwrap_or(false);
        }
        Self::verify_legacy_sha256(hash, password)
    }

    fn hash(&self, password: &str) -> AppResult<String> {
        bcrypt::hash(password, self.cost)
            .map_err(|e| AppError::Repository(e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hashes_and_verifies_bcrypt() {
        let hasher = BcryptPasswordHasher::default();
        let hash = hasher.hash("secret-password").unwrap();
        assert!(hasher.verify(&hash, "secret-password"));
        assert!(!hasher.verify(&hash, "wrong"));
    }
}
