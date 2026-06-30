#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum Weekday {
    Saturday = 0,
    Sunday = 1,
    Monday = 2,
    Tuesday = 3,
    Wednesday = 4,
    Thursday = 5,
    Friday = 6,
}

impl Weekday {
    pub fn number(&self) -> u8 {
        match self {
            Weekday::Saturday => 6,
            Weekday::Sunday => 0,
            Weekday::Monday => 1,
            Weekday::Tuesday => 2,
            Weekday::Wednesday => 3,
            Weekday::Thursday => 4,
            Weekday::Friday => 5,
        }
    }
    pub fn all() -> &'static [Weekday; 7] {
        &[
            Weekday::Saturday,
            Weekday::Sunday,
            Weekday::Monday,
            Weekday::Tuesday,
            Weekday::Wednesday,
            Weekday::Thursday,
            Weekday::Friday,
        ]
    }
}

/// Unix timestamp wrapper with ordering helpers.
///
/// ```
/// use domain::DateTime;
///
/// let t1 = DateTime::new(100);
/// let t2 = DateTime::new(200);
/// assert!(t1.is_before(&t2));
/// assert!(t2.between(&t1, &t2));
/// ```
#[derive(Debug, Clone, Copy, Hash, Default, PartialEq, Eq, PartialOrd, Ord)]
pub struct DateTime(i64);

impl DateTime {
    pub fn new(datetime: i64) -> Self {
        Self(datetime)
    }

    pub fn datetime(&self) -> &i64 {
        &self.0
    }
    pub fn is_before(&self, other: &DateTime) -> bool {
        self.0 < other.0
    }

    pub fn is_after(&self, other: &DateTime) -> bool {
        self.0 > other.0
    }

    pub fn between(&self, start: &DateTime, end: &DateTime) -> bool {
        self.0 >= start.0 && self.0 <= end.0
    }

    /// Weekday derived from Unix timestamp (UTC).
    pub fn weekday(&self) -> Weekday {
        const SECONDS_PER_DAY: i64 = 86_400;
        // 1970-01-01 was a Thursday (day 0 of the Unix epoch).
        match self.0.div_euclid(SECONDS_PER_DAY).rem_euclid(7) {
            0 => Weekday::Thursday,
            1 => Weekday::Friday,
            2 => Weekday::Saturday,
            3 => Weekday::Sunday,
            4 => Weekday::Monday,
            5 => Weekday::Tuesday,
            _ => Weekday::Wednesday,
        }
    }

    /// Seconds elapsed since UTC midnight for this timestamp.
    pub fn seconds_since_midnight(&self) -> u32 {
        const SECONDS_PER_DAY: i64 = 86_400;
        self.0.rem_euclid(SECONDS_PER_DAY) as u32
    }
}

impl std::fmt::Display for DateTime {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}
