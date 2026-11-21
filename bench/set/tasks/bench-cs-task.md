# Add domain validator packs (banking, identifiers, network, text, geo, dates, collections)

## Summary

FluentValidation ships a small set of general-purpose validators (`NotEmpty`,
`Length`, `Matches`, `EmailAddress`, `CreditCard`, ...). Almost every real
application then re-implements the same domain checks with `Must(...)` or
`Matches(...)`: IBANs, ISBNs, IP addresses, country codes, "date must be in the
past", "list must not contain duplicates", and so on. These hand-written rules
are usually incomplete (no checksum, no country table), produce generic
"The specified condition was not met" messages, and are never localized.

This request adds a family of built-in validators grouped by domain. They
plug into the existing rule builder like any built-in validator, use the
existing message formatting and placeholders, and are translated through the
existing `LanguageManager`.

## Proposed API

New rule-builder extension methods, in one partial `DefaultValidatorExtensions`
file per domain:

| Domain                            | Extension methods                                                                                                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Banking                           | `Iban(params string[] allowedCountries)`, `Bic()`, `AbaRoutingNumber()`, `UkSortCode()`                                                                                                              |
| Securities                        | `Isin()`, `Cusip()`, `Sedol()`, `Lei()`                                                                                                                                                              |
| Payments                          | `CreditCard(CardBrands)` (new overload), `CardVerificationCode()`, `CardExpiryDate()`, `CurrencyCode()`, `CurrencyAmount("JPY")`, `CurrencyAmount(x => x.Currency)`                                  |
| Publications                      | `Isbn()`, `Isbn10()`, `Isbn13()`, `Issn()`, `Doi()`, `Orcid()`                                                                                                                                       |
| Product and technical identifiers | `Gtin(params int[] lengths)`, `Imei()`, `Vin()`, `Uuid(int? version)`, `Ulid()`, `LuhnChecksum()`                                                                                                    |
| National identifiers              | `UsSocialSecurityNumber()`, `UkNationalInsuranceNumber()`, `NhsNumber()`, `CanadianSocialInsuranceNumber()`, `BrazilianCpf()`, `DutchBsn()`, `SpanishDni()`, `EuVatNumber()`                         |
| Network                           | `IpAddress()`, `Ipv4Address()`, `Ipv6Address()`, `PublicIpAddress()`, `CidrNotation()`, `Hostname()`, `PortNumber()`, `AbsoluteUrl(params string[] schemes)`, `EmailDomain(params string[] domains)` |
| Text                              | `Alpha()`, `Alphanumeric()`, `Digits()`, `Ascii()`, `NoWhitespace()`, `Trimmed()`, `WordCount(min, max)`, `PasswordStrength(PasswordPolicy)`                                                         |
| Encodings and formats             | `HexString()`, `Base64(bool urlSafe)`, `Json(JsonValueKind?)`, `SemanticVersion()`, `Slug()`                                                                                                         |
| Geo and locale                    | `Latitude()`, `Longitude()` (any signed numeric type), `CountryCode(CountryCodeFormat)`, `PostalCode("GB")`, `PostalCode(x => x.Country)`, `UsStateCode()`, `PhoneNumberE164()`, `TimeZoneId()`      |
| Dates and times                   | `InThePast()`, `InTheFuture()`, `MinimumAge(years)` (for `DateTime`, `DateTimeOffset` and `DateOnly`), `OnDayOfWeek(...)`, `OnWeekday()`, `TimeOfDayBetween(from, to)`, `Iso8601Date()`              |
| Collections and sets              | `UniqueItems()`, `UniqueItems(x => x.Key)`, `CountBetween(min, max)`, `MinimumCount(n)`, `MaximumCount(n)`, `NoNullItems()`, `AllowedItems(...)`, `InAscendingOrder()`, `OneOf(...)`                 |

Behaviour common to all new validators:

- `null` is valid (combine with `NotNull()`/`NotEmpty()` to make a value
  required), like the existing `EmailAddress()` and `CreditCard()`.
  String validators treat the empty string as invalid.
- Each validator has a stable `Name`, used as default error code and as
  localization key (`IbanValidator`, `PostalCodeValidator`, ...), and a public
  `I...Validator` marker interface so that integrations (client-side adapters,
  documentation generators) can detect it through the validator descriptor.
- Checksums are verified where the standard defines one (IBAN, ISIN, LEI, ISBN,
  GTIN, VIN, IMEI, ORCID, BSN, CPF, ...). Country-specific rules use reference
  tables (ISO 4217 currencies with minor units, ISO 3166 country codes, IBAN
  lengths per country, postal code formats).
- Time-dependent validators read the current time from a new
  `ValidatorOptions.Global.TimeProvider` (defaults to `TimeProvider.System`),
  so that tests can use a fixed clock. Each of them also accepts a
  `TimeProvider` argument.
- Collection validators extend `IRuleBuilder<T, IEnumerable<TElement>>`, so
  they work on arrays and lists.

## Scope

- **Shared building blocks.** Public helpers in
  `FluentValidation.Validators.Algorithms` (`Luhn`, `Iso7064`, `Gs1CheckDigit`,
  `WeightedChecksum`, `IdentifierNormalizer`, `CharacterClasses`) and
  reference data in `FluentValidation.Validators.ReferenceData`
  (`CurrencyCodes`, `CountryCodes`, `IbanRegistry`, `PostalCodeFormats`,
  `UsStateCodes`), so that custom validators can reuse them. A new
  `StringFormatValidator<T>` base class removes the null/empty boilerplate
  from string-format validators.
- **Refactor existing validators onto the shared logic.** `CreditCardValidator`
  uses `Luhn` and `IdentifierNormalizer` (behaviour unchanged, including the
  empty-string case), `AspNetCoreCompatibleEmailValidator` shares its address
  splitting with the new `EmailDomainValidator`, and `PrecisionScaleValidator`
  shares its digit counting with `CurrencyAmountValidator`.
- **Message formatting.** Add `MessageFormatter.AppendListArgument(...)` to
  render list placeholders (`{AllowedValues}`, `{AllowedDays}`,
  `{CardBrands}`, ...) consistently, and use it in the new validators.
- **Localization.** English messages for every new key, plus French, German,
  Spanish, Italian, Portuguese and Dutch translations. Extend the
  `All_localizations_have_same_parameters_as_English` test with the new keys
  (other languages fall back to English).
- **Tests.** One test class per validator (valid values, invalid values,
  default message and error code), tests for the algorithms and reference
  data, rule-builder integration tests per domain (custom messages, error
  codes, conditions, descriptors, nullable properties) and localization tests
  per domain.
- **Docs.** Document every validator in `docs/built-in-validators.md`, describe
  the reusable helpers in `docs/custom-validators.md`, the new keys in
  `docs/localization.md`, placeholders and `TimeProvider` in
  `docs/configuring.md`, and add a changelog entry.

## Out of scope

- Client-side (ASP.NET) adapters for the new validators.
- Translations for languages other than the six listed above; they fall back
  to English through the existing `LanguageManager` fallback.
