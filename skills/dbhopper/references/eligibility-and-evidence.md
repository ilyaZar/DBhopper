# Eligibility And Evidence

The NRW Mobilitätsgarantie applies when a local NRW public transport departure
at the starting stop is delayed or cancelled by at least 20 minutes. The claim
has to be submitted within 14 calendar days.

Required claim facts:

- claimant name, email, phone, and address
- incident date and scheduled departure time
- starting stop and destination stop
- planned local line or train label when known
- delay minutes or cancellation gap at the starting stop
- replacement transport type: IC/EC/ICE, taxi, or sharing
- replacement cost and number of companions
- account owner and IBAN

Sensitive reusable facts such as name, email, address, and bank data should live
in a local TOML profile under `assets/private/profiles/`. The editable
`claim.toml` should store only the selected profile name and claim-specific
journey, ticket, and evidence fields.

Required evidence:

- original local/NRW/Deutschlandticket proof
- replacement IC/EC/ICE ticket, taxi receipt, or sharing receipt
- screenshot/photo of delay or cancellation when relying on displayed forecast
  at scheduled departure

Known form structure as of 2026-06-08:

- public wrapper: `https://www.mobil.nrw/fahren/mobigarantie/einreichen.html`
- embedded form app: `https://mg.kcm-nrw.de/elmapublic/`
- top-level blocks: legal questions, personal data, route/date/time, base
  ticket, bank details, summary
- route search uses station autocomplete and selectable regional journeys
- the form offers a downloadable PDF confirmation after successful submission
