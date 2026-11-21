# Add families of domain-specific validation decorators

## Summary

class-validator ships with a broad set of general-purpose decorators, most of them thin wrappers over validator.js. Applications still keep writing the same domain checks by hand with `@Matches` or custom constraint classes: vehicle identification numbers, bank routing numbers, private IP ranges, minimum ages, "no leading or trailing whitespace" and so on. These checks are easy to get subtly wrong (check digits, IPv6 prefix arithmetic, birthdays on 29 February, time ranges that wrap past midnight), so it would help to have well-tested built-in versions.

This issue proposes a set of new built-in decorators grouped by domain. Each one should come with:

- a validator function (`isXxx(value, ...)`) and a decorator (`@IsXxx(..., validationOptions?)`) built on `ValidateBy`, with a `IS_XXX` name constant, like the existing decorators;
- a default English message that honours the `each` prefix and exposes parameters as `$constraint1`, `$constraint2`, ...;
- a reference page under `docs/reference/<family>/`, plus one overview page per family linked from `docs/README.md` and rows in the README decorator table;
- a spec file covering valid values, invalid values (including non-strings and `null`) and the default message.

## Proposed decorators

**Identifiers**: `IsVIN`, `IsIMEI`, `IsCUSIP`, `IsSEDOL`, `IsLEI`, `IsGTIN` (GTIN-8/12/13/14, optionally restricted), `IsUPC`, `IsULID`, `IsKSUID`, `IsNanoId(size?)`, `IsSlug`, `IsNHSNumber`, `IsDOI`, `IsORCID`, `IsISNI`, `IsASIN`.

**Finance**: `IsABARoutingNumber`, `IsSortCode`, `IsBSB`, `IsIFSC`, `IsCLABE`, `IsCardBrand(brands)`, `IsCardExpiry`, `IsCardVerificationCode(length?)`, `IsMonetaryAmount({ maxDecimalPlaces, allowNegative })`, `IsPercentage({ min, max })`, `IsBasisPoints`, `IsVATNumber(countries?)`, `IsPaymentReference` (ISO 11649 RF), `IsFIGI`.

**Networking**: `IsCIDR(version?)`, `IsInSubnet(cidrs)`, `IsPrivateIP`, `IsPublicIP`, `IsLoopbackIP`, `IsMulticastIP`, `IsHostname` (RFC 1123), `IsDNSLabel`, `IsEmailDomain(domains, { allowSubdomains })`, `IsUrlWithScheme(schemes)`, `IsWebSocketUrl`, `IsASN`, `IsVLANId`, `IsPortRange`.

**Dates and times**: `IsInPast`, `IsInFuture`, `IsMinAge`, `IsMaxAge`, `IsAgeBetween`, `IsWeekday`, `IsWeekend`, `IsOnDaysOfWeek(days)`, `IsDateBetween(min, max)`, `IsUnixTimestamp({ unit })`, `IsISO8601Duration`, `IsISOWeekDate`, `IsTimeOfDay`, `IsTimeOfDayBetween(start, end)`. Validators that depend on the current time accept an optional `now: () => Date` so they can be tested deterministically.

**Text**: `IsTrimmed`, `IsWithoutWhitespace`, `IsWithoutControlChars`, `IsWithoutHtml`, `IsSingleLine`, `IsMaxLines(n)`, `IsWordCount(min, max)`, `IsMinWords(n)`, `IsMaxWords(n)`, `IsCamelCase`, `IsPascalCase`, `IsSnakeCase`, `IsKebabCase`.

## Expected behaviour

- Validator functions return `false` for values of the wrong type instead of throwing.
- Check digits are verified wherever the standard defines one (VIN, IMEI, CUSIP, SEDOL, LEI, GTIN, NHS, ORCID, ISNI, ABA, CLABE, RF references, FIGI, card numbers).
- Invalid configuration (an inverted age or date range, a malformed subnet, an unsupported VAT country, a negative word count) throws when the decorator is applied, not when a value is validated.
- Existing decorators keep their behaviour and messages.

## Implementation notes

- Shared check-digit algorithms (Luhn, ISO 7064 MOD 97-10 and MOD 11-2, GTIN, weighted sums) should live in one internal helper in `src/utils`. The existing `IsEAN`, `IsISIN`, `IsISBN` and `IsISSN` can reuse it instead of validator.js, as long as their results do not change.
- IPv4/IPv6 parsing and prefix matching should live in one internal helper used by all IP-related decorators.
- Date resolution (`Date | () => Date`) is already duplicated in `MinDate` and `MaxDate`; a shared helper should serve both the old and the new date decorators.
- The `checkValidValues` / `checkInvalidValues` / `checkReturnedError` helpers of the big functional spec should move to a shared test utility so that the new spec files can use them.
- The new decorators should also be exercised by the existing functional specs that cover validation options (`each`, groups, messages, context), sync/nested/inherited/conditional validation and `ValidationError`.
- The only spec that lives under `src/` (`src/decorator/common/IsIn.spec.ts`) can move to `test/functional/`.
- The existing test suite must keep passing: `npx jest --coverage=false`; `npx tsc --noEmit -p tsconfig.json`, `npm run lint:check` and `npm run prettier:check` must pass too.
