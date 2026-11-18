/** The one user the host signs in. There is no login page: every browser is this user. */
export const TEST_SUBJECT = "conformance-user";

/**
 * Every claim the standard scopes can release, for the test user. The provider keeps only the claims the
 * granted scopes release and sets `sub` itself, so this returns the whole record.
 */
export const TEST_USER_CLAIMS: Readonly<Record<string, unknown>> = {
  name: "Conformance Test User",
  given_name: "Conformance",
  family_name: "User",
  middle_name: "Test",
  nickname: "tester",
  preferred_username: "conformance-user",
  profile: "https://example.com/conformance-user",
  picture: "https://example.com/conformance-user.png",
  website: "https://example.com",
  gender: "female",
  birthdate: "1990-01-01",
  zoneinfo: "Europe/Stockholm",
  locale: "en-US",
  updated_at: 1_700_000_000,
  email: "conformance-user@example.com",
  email_verified: true,
  address: {
    formatted: "1 Test Street\nStockholm 11122\nSweden",
    street_address: "1 Test Street",
    locality: "Stockholm",
    region: "Stockholm",
    postal_code: "11122",
    country: "SE",
  },
  phone_number: "+46 8 123 456",
  phone_number_verified: true,
};
