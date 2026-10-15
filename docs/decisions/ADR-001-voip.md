# ADR-001: Telephony provider and architecture for reselling calls

- Status: proposed, for owner decision at gate G1
- Date: 2026-10-09
- All prices are public list prices retrieved on 2026-10-09. Sources are numbered in the last section. Nothing was purchased and no vendor was contacted.
- Companion documents: `docs/COST-MODEL.md`, `docs/CALL-AUTOMATION.md`

> **Superseded in part on 2026-10-14 — see "Addendum A" at the end.** The owner could not sign up with Plivo and asked for an easier provider. The Plivo-first decision below is kept for the record; Addendum A replaces it.

## 1. Decision

**Use Plivo as the main telephony provider, with one sub-account per agency, and keep Twilio as the second provider for the countries Plivo cannot serve (Germany and Malaysia today). Do not self-host a phone system.** In India, launch with call-bridge (the provider rings the agent's own phone, then the customer, and joins them) through Plivo's India service, and add the in-app softphone only after Plivo confirms in writing that it is allowed for domestic Indian calls. In the UK, US, Australia and Singapore, resell numbers and minutes with an in-app softphone. Do not offer calling in the UAE, Saudi Arabia, Qatar, Thailand, Sri Lanka, Nepal or Bangladesh at launch. This overturns the working hypothesis (Twilio first): Twilio cannot provide Indian numbers or domestic Indian calls at all, and where both providers work Plivo's list prices are 39% to 51% lower for a typical agency in the US and UK.

### Words used in this document

| Term | Meaning |
|---|---|
| PSTN | The ordinary phone network (landlines and mobiles). |
| Softphone | A phone inside the desktop app that uses the computer's microphone and sends the audio over the internet. Built with a "WebRTC SDK", a code library the provider supplies. The desktop app is Electron, which is a browser inside, so a browser SDK works. |
| Call-bridge | The provider places two ordinary phone calls, one to the agent's phone and one to the customer, and connects them. No softphone and no internet audio on the agent's side. |
| Sub-account | A separate compartment inside the platform's provider account, one per agency, with its own numbers, call records and keys. The platform gets one bill and can see usage per compartment. |
| SIP trunk | A wholesale line that connects your own phone server to the phone network. You run the server; the trunk only carries the calls. |
| Self-hosted PBX | Running your own phone server (FreeSWITCH or Asterisk) instead of using a provider's hosted one. |
| KYC | "Know your customer": identity and address documents a phone company must collect before giving out a number. |
| Toll bypass | Carrying a call over the internet and dropping it into a country's phone network as if it were local, avoiding the licensed long-distance carriers. Prohibited in India. |
| Caller ID | The number the person being called sees. |

## 2. Why

### 2.1 India decides the question, and Twilio cannot do India

India is the home market. Twilio's own country guidelines say [S10]:

- "Outbound calls to India can only be made from international (non-Indian) numbers."
- Domestic calling within India: not available. Domestic and international inbound: not supported (toll-free inbound only).
- Emergency calls: not supported.

So an Indian agency on Twilio would call Indian customers from a foreign number, could not receive calls on a local number, and would pay international rates: $0.0496 per minute to Indian mobiles and $0.0699 to landlines [S1], about ₹4.80 and ₹6.77.

Plivo runs a separate domestic India service [S15, S16]: ₹0.38 per minute outbound and inbound, ₹0.25 per minute for the softphone leg, ₹200 a month per Indian number. Conditions, from Plivo's documentation [S16]:

- Only businesses registered in India can rent Indian numbers and use domestic routes.
- KYC is required before renting a number (search result summarising Plivo's support pages lists Certificate of Incorporation and GST certificate [S17]).
- The caller ID must be a Plivo Indian number.
- "Both legs of a call must originate and terminate within India." Plivo calls this media anchoring; calls that break it fail.
- Number series matter: 140-series for promotional calls only, landline-series for service and transactional calls. Cold calling without consent is not allowed.

Per minute, Plivo India is about one-eighth of Twilio's price to the same phones (₹0.63 with the softphone leg against ₹5.19).

### 2.2 Outside India, Plivo is cheaper where both work, and neither covers everything

My arithmetic, for one agency making 96 outbound minutes (70% to mobiles, 30% to landlines) and receiving 24 inbound minutes a month through a softphone, with one local number, recorded. Inputs in section 3.

| Market | Twilio, per agency per month | Plivo, per agency per month | Plivo saving |
|---|---|---|---|
| India | not workable (see 2.1) | ₹276 (about $2.85) | n/a |
| United Kingdom | $7.02 | $3.41 | 51% |
| United States | $3.48 | $2.13 | 39% |
| Australia | $9.79 | $8.60 | 12% |
| Germany | $6.01 | cannot serve: inbound "not supported", no number listed [S20] | n/a |
| Singapore | number and inbound price not found on Twilio's page | $9.85 | n/a |
| Malaysia | $12.52 | cannot serve: outbound to mobiles "not supported" [S24] | n/a |

The hypothesis said to add a cheaper provider if it saves 30% or more on the top routes. Plivo clears that bar in the US and UK and is the only one of the two that works in India. Twilio is still needed for Germany and Malaysia.

### 2.3 Both adapters already exist

The code has a `VoipProvider` interface with a Twilio and a Plivo implementation (`backend/src/services/voip-provider.ts:102-134`, `twilio-voice.ts`, `plivo-voice.ts`), a per-agency provider setting, and callback endpoints that already read both providers' field names (`backend/src/routes/voip-callbacks.ts:123-129`). Neither works end to end today (see `docs/CALL-AUTOMATION.md` section 1), so choosing Plivo first does not throw away working code. The Twilio side is slightly more complete; the Plivo side is missing its outbound answer route (`plivo-voice.ts:47` points at `/xml/outbound`, which does not exist).

### 2.4 A team of one or two cannot run a phone server

Section 5.4 has the numbers. In short: self-hosting saves at most the provider's softphone and recording fees, about $0.0065 a minute on Twilio's price list, which is roughly $780 a month at 1,000 agencies, and in exchange needs a server that never goes down, a person on call, and its own fraud defences. It also does not solve India, where connecting internet calls to the phone network needs a telecom licence.

## 3. What it costs

### 3.1 Figures from sources (list prices, USD unless marked, retrieved 2026-10-09)

**Twilio Programmable Voice** [S1–S9]. Softphone leg ("browser/app calling") $0.0040 per minute in every country. Recording $0.0025 per minute; recording storage $0.0005 per minute per month.

| Country | Outbound to landline, per min | Outbound to mobile, per min | Inbound on a local number, per min | Local number, per month |
|---|---|---|---|---|
| India | $0.0699 | $0.0496 | not offered [S10] | no Indian local number; "international numbers from $1.15" |
| United Kingdom | $0.0158 | $0.0305 | $0.0100 | $3.50 (mobile number $2.50) |
| Germany | $0.0283 | $0.0420 | $0.0100 | $1.35 (mobile number $30.00) |
| United States | $0.0140 | $0.0140 | $0.0085 | $1.15 |
| Australia | $0.0252 | $0.0750 | $0.0100 (mobile number $0.0500) | $3.00 (mobile number $8.25) |
| UAE | $0.3635 | $0.2995 | not found on the price page | not found; see section 4 for the restrictions |
| Saudi Arabia | $0.1738 | $0.3122 | not found | no Saudi local number listed |
| Singapore | $0.0423 | $0.0578 | not found | not found (the page shows only "international numbers from $1.15") |
| Malaysia | $0.0555 | $0.0800 | $0.0318 | $4.00 |

**Plivo Voice** [S15, S18–S24]. Softphone leg ("Browser SDK") $0.0033 per minute outside India, ₹0.25 in India. Recording free; storage free for 90 days, then $0.0004 per minute per month.

| Country | Outbound to landline, per min | Outbound to mobile, per min | Inbound on a local number, per min | Local number, per month |
|---|---|---|---|---|
| India (domestic service) | ₹0.38 | ₹0.38 | ₹0.38 | ₹200 |
| United Kingdom | from $0.0075 | $0.0270 | $0.0055 | $0.85 |
| Germany | $0.0135 | $0.0495 | not supported | not listed |
| United States | $0.0115 | $0.0115 | $0.0055 | $0.50 |
| Australia | $0.0230 | $0.0730 | $0.0055 | $2.50 |
| UAE | $0.2290 | $0.2660 | $0.10285 (landline numbers only) | $150.00 |
| Saudi Arabia | $0.1800 | $0.2800 | not supported (toll-free only, $0.7470) | toll-free only, $115.00 |
| Singapore | $0.0340 | $0.0489 | $0.0080 | $5.00 |
| Malaysia | $0.0450 | not supported | $0.0150 | $4.00 |

Note: the Australia page may display Australian dollars; the figures above are as shown with a "$" sign. Confirm the currency with Plivo.

**Telnyx Voice API** [S25]. Only US list prices are published on the page; other countries are in a downloadable rate sheet I could not read.

| Item | US list price |
|---|---|
| Voice API fee | $0.002 per minute, on top of the trunk price |
| Outbound (trunk) | $0.005 per minute, so $0.007 with the fee |
| Inbound (trunk) | $0.0032 per minute, so $0.0052 with the fee |
| Softphone (WebRTC) | $0.002 per minute |
| Local number | $1.00 per month |
| Recording | $0.002 per minute; storage $0 |
| India, UK, Germany, Australia, UAE, Saudi Arabia, Singapore, Malaysia | **not found**. Ask Telnyx for the rate sheet and for which of these countries it sells local numbers in. |

**India-specific provider, for comparison: Exotel.** Per-minute rates are not published. Bundled plans reported by third parties (not Exotel's own page): ₹9,999 for 5 months with 1 number and 3 agents, ₹19,999 for 11 months with 2 numbers and 6 agents, ₹49,499 for 11 months with 10 numbers [S27]. Exotel holds India's virtual network operator licence (UL-VNO) [S28] and documents a softphone SDK that mixes internet and phone-network calls under that licence [S29].

### 3.2 My arithmetic

Per agency per month, 96 outbound minutes (67 to mobiles, 29 to landlines), 24 inbound minutes, one local number, softphone, all calls recorded.

| Market, provider | Outbound | Inbound | Number | Recording | Total |
|---|---|---|---|---|---|
| UK, Twilio | 96 × (0.7×0.0305 + 0.3×0.0158 + 0.0040) = $2.89 | 24 × (0.0100 + 0.0040) = $0.34 | $3.50 | 120 × 0.0025 = $0.30 | **$7.02** |
| UK, Plivo | 96 × (0.7×0.0270 + 0.3×0.0075 + 0.0033) = $2.35 | 24 × (0.0055 + 0.0033) = $0.21 | $0.85 | $0 | **$3.41** |
| US, Twilio | 96 × (0.0140 + 0.0040) = $1.73 | 24 × (0.0085 + 0.0040) = $0.30 | $1.15 | $0.30 | **$3.48** |
| US, Plivo | 96 × (0.0115 + 0.0033) = $1.42 | 24 × (0.0055 + 0.0033) = $0.21 | $0.50 | $0 | **$2.13** |
| US, Telnyx (assuming the softphone fee adds to the call fee) | 96 × (0.007 + 0.002) = $0.86 | 24 × (0.0052 + 0.002) = $0.17 | $1.00 | 120 × 0.002 = $0.24 | **$2.28** |
| Australia, Twilio | 96 × (0.7×0.0750 + 0.3×0.0252 + 0.0040) = $6.15 | $0.34 | $3.00 | $0.30 | **$9.79** |
| Australia, Plivo | 96 × (0.7×0.0730 + 0.3×0.0230 + 0.0033) = $5.89 | $0.21 | $2.50 | $0 | **$8.60** |
| Germany, Twilio | 96 × (0.7×0.0420 + 0.3×0.0283 + 0.0040) = $4.02 | $0.34 | $1.35 | $0.30 | **$6.01** |
| Singapore, Plivo | 96 × (0.7×0.0489 + 0.3×0.0340 + 0.0033) = $4.58 | 24 × (0.0080 + 0.0033) = $0.27 | $5.00 | $0 | **$9.85** |
| Malaysia, Twilio | 96 × (0.7×0.0800 + 0.3×0.0555 + 0.0040) = $7.36 | 24 × (0.0318 + 0.0040) = $0.86 | $4.00 | $0.30 | **$12.52** |
| India, Plivo, softphone | 96 × (₹0.38 + ₹0.25) = ₹60 | 24 × ₹0.63 = ₹15 | ₹200 | ₹0 | **₹276** |
| India, Plivo, call-bridge | 96 × (₹0.38 × 2 legs) = ₹73 | 24 × ₹0.76 (forwarded to the agent's mobile) = ₹18 | ₹200 | ₹0 | **₹291** |
| India, Twilio (foreign caller ID, no inbound) | 96 × ($0.0496 + $0.0040) = $5.15 = ₹498 | not possible | $1.15 = ₹111 | $0.24 | **about ₹632, and it is the wrong product** |

Exchange rate used: 1 USD = ₹96.83 [S40].

Two things stand out:

1. **In India the number costs more than the calls.** ₹200 a month is ₹2,400 a year, which is 20% of the Basic plan's ₹12,000. Calling cannot be bundled into Basic at today's price. See the cost model, section 6.
2. **Mobile termination dominates outside India.** The softphone and recording fees are small next to the per-minute price to mobiles, so the provider's route prices matter more than its platform fees.

### 3.3 My assumptions

- The 120-minute profile and the 80/20 outbound/inbound split come from `README.md:653` and the earlier pricing notes; the 70/30 mobile/landline split is mine.
- List prices only. All three providers advertise volume discounts; none were assumed.
- Indian prices are assumed to exclude 18% GST, which a GST-registered platform can normally reclaim. Confirm with the accountant.
- Calls are billed per started minute by most providers; real bills run a little higher than minutes × rate.

## 4. Per-country position

Positions: **RESELL** (platform provides numbers and minutes), **OWN ACCOUNT ONLY** (the agency uses its own locally compliant provider and the platform only connects to it), **CALL-BRIDGE ONLY** (provider rings the agent's phone and the customer's phone and joins them; no softphone), **NOT OFFERED AT LAUNCH**.

| Country | Position at launch | Provider | Reason |
|---|---|---|---|
| India | **CALL-BRIDGE ONLY**, resold through Plivo's India service, each agency passing KYC. Upgrade to RESELL with softphone after written confirmation (see 4.1). If Plivo will not let the platform hold numbers for agencies: OWN ACCOUNT ONLY. | Plivo India | Twilio has no domestic service [S10]. Only licensed access providers may connect internet calls to the Indian phone network [S11]. Call-bridge keeps both legs on the ordinary network inside India, which is the plainest fit with Plivo's "both legs in India" rule [S16]. |
| United Kingdom | **RESELL** | Plivo | Local numbers $0.85 a month; business name and UK address needed for local numbers [S30]. |
| United States | **RESELL** | Plivo | Cheapest market. US text messaging needs separate sender registration; voice does not. Telecom taxes and fees on resale need the accountant (section 7). |
| Australia | **RESELL** | Plivo (Twilio is within 12%) | Local numbers need an Australian business address and company documents [S32]. |
| Germany, as the EU example | **RESELL**, second wave | Twilio | Plivo has no inbound. A German local number needs a business address inside that area code and company registration documents, and is not available to individuals [S31]. Each EU country has its own rules; open them one at a time when an agency asks. |
| Singapore | **RESELL**, second wave | Plivo | Local numbers $5 a month. Twilio's guidelines say national numbers need a Singapore-registered business [S33]; expect the same at Plivo. Ask Plivo. |
| Malaysia | **RESELL**, second wave | Twilio | Plivo cannot call Malaysian mobiles. Numbers need a Malaysian address and company registration (SSM) [S34]. |
| UAE | **NOT OFFERED AT LAUNCH** | none | Only the two licensed operators may provide telecom services, including internet calling [S13]. Twilio's UAE numbers may only receive calls, may not place them, and toll-free numbers may not be resold or passed to third parties [S12]. Calling UAE phones from abroad costs $0.23 to $0.36 a minute [S6, S22]. Agencies use their existing phones and WhatsApp; the CRM offers manual call logging. |
| Saudi Arabia | **NOT OFFERED AT LAUNCH** | none | No local numbers from Twilio or Plivo (Plivo: toll-free only at $115 a month and $0.747 a minute inbound [S23]). Outbound $0.17 to $0.31 a minute [S7, S23]. Licensing rule for business internet calling: **needs legal confirmation** (section 4.2). |
| Qatar | **NOT OFFERED AT LAUNCH** | none | Twilio lists no Qatari number; calling Qatar phones costs $0.30 (landline) to $0.40 (mobile) a minute [S41]. Rules on resold business calling: not found, needs legal confirmation. |
| Thailand | **NOT OFFERED AT LAUNCH** | none (Twilio later) | Twilio has Thai local numbers but at $25 a month, with outbound at $0.10 a minute and inbound at $0.0107 [S42]. The number alone costs more than most plans could carry. Document rules not researched. |
| Sri Lanka | **NOT OFFERED AT LAUNCH** | none | No local number price listed; outbound $0.29 (mobile) to $0.35 (landline) a minute [S43]. |
| Nepal | **NOT OFFERED AT LAUNCH** | none | No local number listed; outbound $0.30 to $0.31 a minute [S44]. |
| Bangladesh | **NOT OFFERED AT LAUNCH** | none | No local number price listed; outbound $0.06 a minute [S45]. Rules not researched. |

For every "not offered" country the product still works: leads, WhatsApp, email, itineraries, invoices. Only the phone features are hidden.

### 4.1 India: what is and is not allowed

Stated carefully. Items marked "needs legal confirmation" are my reading of secondary sources or of a vendor's documentation, not of the law itself.

| Statement | Basis | Confidence |
|---|---|---|
| Connecting internet calls to the Indian phone network ("unrestricted internet telephony") is a licensed activity. Indian telecom licences permit it for basic-service, mobile and unified licence holders with access-service authorisation. | TRAI document quoting the licensing framework [S11] | Reputable source. The platform holds no such licence, so it must use a provider that does, or that provider's reseller arrangement. |
| The Department of Telecommunications clarified on 19 June 2018 that a licensed access provider may offer internet telephony over another company's internet service. | TRAI recommendations referring to the clarification [S11] | Reputable source. |
| Cloud-telephony companies operating in India obtain a virtual network operator licence (UL-VNO): Exotel and Genesys both announced one. | Trade press [S28] | Confirms the pattern, not that it is legally required for our case. |
| An unlicensed software company that holds Indian numbers in its own name and hands them to agencies is reselling a telecom service and may itself need a UL-VNO licence. | My inference from the above | **Needs legal confirmation.** This is the single biggest open question for the reseller model in India. |
| Each agency that uses an Indian number must pass KYC with the provider. | Plivo documentation [S16, S17] | Vendor rule. Whether KYC must be in the agency's name or may be in the platform's name: ask Plivo, in writing. |
| Carrying a call from abroad over the internet and delivering it into India as a local call (toll bypass) is prohibited. Call-centre rules have long said phone-network lines must not "directly or indirectly" bypass the licensed long-distance operators. | Older OSP terms quoted in a TRAI-hosted document [S11]; Plivo's "both legs in India" rule [S16]; Twilio allowing only foreign caller IDs into India [S10] | The prohibition is consistent across all three sources. The exact wording of the current (2021) OSP guidelines was **not retrieved**; needs legal confirmation. |
| An Indian agency cannot use the resold Indian number to call customers abroad, and an agent travelling abroad cannot use it. | Follows from Plivo's media anchoring [S16] | Vendor rule. |
| Calls that sell something to people who have not agreed to be called are unsolicited commercial communication. TRAI can have them blocked. Promotional calls must use the 140 number series. | Twilio guidelines [S10]; Plivo documentation [S16] | Vendor summaries of TRAI rules. Agencies returning a customer's enquiry are making service calls, not promotional ones. |
| Whether a softphone in the browser counts as "originating in India" for Plivo's rule, and whether Plivo allows it on domestic routes. | Not addressed in Plivo's documentation [S16] | **Not found. Ask Plivo.** This is why India launches with call-bridge. |
| OSP registration (the old call-centre registration) no longer applies to an agency phoning its own customers. | Law-firm article on the 2019 TRAI recommendations: entities serving only their own customers are treated as captive [S14] | Secondary source about recommendations, not the final guidelines. **Needs legal confirmation.** |

### 4.2 UAE and Saudi Arabia

| Statement | Basis | Confidence |
|---|---|---|
| UAE: only Etisalat (e&) and du are licensed to provide telecom services, and that includes internet calling. Companies wanting to offer it must work through them. | Regulator statements reported by Gulf News, Khaleej Times, Gulf Business [S13] | Press reports of the regulator's position. The regulator's own page could not be retrieved (404). **Needs legal confirmation** of the current text. |
| UAE: a Twilio UAE geographic number "will only be used to receive inbound voice calls"; placing outbound calls from it is "strictly prohibited"; a UAE toll-free number may not be transferred, resold, leased or made available to third parties. | Twilio guidelines [S12] | Vendor rule, quoted. This rules out reselling. |
| Saudi Arabia: the ban on internet calling apps was lifted in September 2017 for services that meet the regulator's requirements. | BBC, Reuters via others [S13b] | Press. Says nothing about a foreign company reselling business phone service. **Needs legal confirmation.** |
| Saudi Arabia: Twilio's Saudi voice guideline page | Not found (404) | Ask Twilio. |

## 5. The options compared

### 5.1 Feature comparison

| | Twilio | Plivo | Telnyx | Self-hosted FreeSWITCH or Asterisk + SIP trunk |
|---|---|---|---|---|
| Softphone SDK for the desktop app | Yes, Voice JavaScript SDK | Yes, Browser SDK | Yes, WebRTC SDK | Build it yourself (FreeSWITCH `mod_verto` or an open-source SIP-over-web library) |
| One compartment per agency with its own usage records | Sub-accounts: up to 1,000 by default; "Twilio bills all subaccount usage directly to your main account"; numbers can be moved between them; closing one releases its numbers [S26] | Sub-accounts: "Subaccounts let you manage multiple customer accounts under your main account"; each has its own ID and token; "charges deduct from the main account". No limit on their number is stated, and the page does not say whether call records can be filtered by sub-account [S36]: ask (section 10) | "Managed accounts"; details not retrieved | You build tenant separation and call records yourself |
| India domestic | No [S10] | Yes, for India-registered businesses [S16] | Not found | Not without a telecom licence [S11] |
| Recording | $0.0025/min + $0.0005/min/month storage | Free; storage free 90 days then $0.0004/min/month | $0.002/min; storage $0 | Free, on your own disk |
| Adapter in our code | Yes, most complete | Yes, outbound route missing | None | None |
| Who keeps it running | Provider | Provider | Provider | You, around the clock |

### 5.2 Build effort, in plain terms

| Option | Effort | Why |
|---|---|---|
| Plivo, India call-bridge | **Small to medium** | No softphone. Fix the outbound flow to ring the agent's mobile first, forward inbound to the agent's mobile, register numbers, meter minutes. Most of the callback code exists. |
| Plivo softphone (UK, US, Australia, Singapore) | **Medium** | Add the Browser SDK to the desktop app, an in-call panel, token issuing, the missing outbound route, sub-account creation, signature checks, minute caps. |
| Twilio softphone | **Medium**, slightly less than Plivo | The adapter and TwiML endpoints are further along. Same softphone, panel and metering work. |
| Twilio added after Plivo (or the reverse) | **Small to medium** | Events, metering, billing and screens are shared. The second softphone SDK and the second set of callbacks are the new work. |
| Telnyx | **Medium to large** | No adapter. Every piece is new, and its international prices are not public, so the saving is unproven. |
| Self-hosted | **Large, and it never ends** | Phone server, softphone signalling, firewall and fraud rules, recording storage, monitoring, failover, upgrades. Then someone must answer when it breaks at night. |

### 5.3 Why not Telnyx first

On US list prices Telnyx ($2.28 per agency per month) is level with Plivo ($2.13). Its prices for our other markets are not published, it has no adapter in the code, and nothing suggests it serves India domestically. Keep it as the candidate third provider if US volume grows: ask for the rate sheet (section 10).

### 5.5 Also considered: calls inside WhatsApp

Twilio's WhatsApp price page lists voice calls placed through WhatsApp Business: Meta charges about $0.0114 per outbound minute in India and the rest of Asia Pacific, $0.0103 in Western Europe, $0.0121 in North America and $0.0127 in the Middle East; inbound is free; Twilio adds $0.005 a minute [S46]. No phone number rental is involved and Indian customers already use WhatsApp. It is not a replacement for phone calls (the customer must be on WhatsApp and must have agreed to be called), it was not researched further, and internet calling inside apps is restricted in the UAE [S13]. Worth a second look after launch as a cheap inbound channel for India.

### 5.4 Why not self-hosted

| Question | Answer |
|---|---|
| What does it save? | The provider's softphone and recording fees. On Twilio's list that is $0.0040 + $0.0025 = $0.0065 a minute. At 1,000 agencies × 120 minutes = 120,000 minutes a month, about $780 a month. On Plivo the softphone fee is $0.0033 and recording is free: about $400 a month. Call termination, the big cost, is still paid to a trunk provider. |
| What does it cost? | A server with a real uptime promise in each region (the Oracle free machine is not one: Oracle reclaims idle free instances and gives no capacity guarantee [S38]), plus the hours of someone who understands SIP, plus the cost of one fraud incident. |
| Does it fix India? | No. A private phone server connected to the Indian phone network is exactly what needs a licence [S11]. |
| The earlier internal note said self-hosting saves 37% in India. | That compared two Twilio prices of about ₹3.10 to ₹3.74 a minute (`product-requirment/PRICING-cost-model-v3-final.md:20`). Plivo's Indian domestic price of ₹0.38 makes both irrelevant. |

Reconsider only above roughly one million minutes a month, with a hired telecom engineer.

## 6. What must be built

In order. Items 1 to 6 are needed for India call-bridge; 7 to 9 for softphone countries.

1. **Provider accounts.** A Plivo India account (India-registered company, KYC, billed in rupees) and a Plivo international account. Confirm whether these are one account or two.
2. **Sub-account per agency**, created when an agency turns on calling; its ID stored against the agency. Stop using the per-agency credential columns for resold calling (they remain for "own account" agencies).
3. **Number purchase and release.** Buying a number assigns it to the agency's sub-account and registers it so inbound calls find the agency (today the purchase does not register it, and deleting a number does not release it at the provider, so billing continues; `backend/src/routes/voip.ts:495-523` per the audit).
4. **Correct call flows.** Outbound: ring the agent first, then the customer. Inbound: find the agency, the contact and the open lead; ring the agent; fall back to voicemail on no answer.
5. **Security on callbacks.** Check the provider's signature and process each callback once.
6. **Metering and limits.** Read usage per sub-account from the provider's call records every few minutes; keep a prepaid balance per agency; refuse new outbound calls at zero (section 7).
7. **Softphone in the desktop app**: provider SDK, microphone permission, in-call panel, screen pop.
8. **Recording handling**: consent announcement, copy to our own storage, retention, deletion at the provider.
9. **Call events** for the automations: see `docs/CALL-AUTOMATION.md` section 4.
10. **Billing**: top-ups, per-minute retail prices by country, monthly statement per agency, tax lines.
11. **Country switch**: calling features shown only where section 4 says RESELL or CALL-BRIDGE.

## 7. Reseller checklist

| Item | What to do | In the code today |
|---|---|---|
| Per-agency metering | Pull call records per sub-account from the provider on a schedule; never trust numbers typed in the app. | Minutes are counted only when an agent saves a call outcome (`routes/calls.ts:411-423`). Replace. |
| Minute caps and hard stops | Check the balance before every outbound call. Refuse at zero. Never cut a live call. Inbound gets a small overdraft so customers do not hit a dead line. | The cap `voip_minutes_per_month` exists and is never checked. |
| Prepaid or postpaid | **Prepaid.** The platform pays the provider after the fact; an agency that runs up calls and does not pay is the platform's loss. Agencies buy a balance (for example ₹500 or $10) and can turn on automatic top-up. | Not built. |
| Markup | Price per minute by country at roughly twice cost, with a floor that covers payment fees. See the cost model, section 6. Number rental charged monthly at cost plus 25% to 50%. | Not built. |
| Fraud: country permissions | Each agency may call only its own country by default. Other countries are switched on one at a time by the platform, not by the agency. Both providers have a setting for this; also enforce it in our own code before dialling. | Not built. |
| Fraud: premium and satellite numbers | Block premium-rate and satellite prefixes outright. | Not built. |
| Fraud: rate limits | Limits per agent and per agency: calls per minute, calls at once, maximum call length (for example 2 hours), daily spend. | `apiRateLimit` is defined and never applied. |
| Fraud: spend alerts | Alert the platform owner when an agency's daily spend passes a multiple of its average, and when the whole account passes a daily figure. Twilio offers usage triggers; confirm the Plivo equivalent. | Not built. |
| Fraud: sign-up | No calling during the free trial, or a very small capped allowance. Fraudsters sign up for trials to pump calls to numbers they earn from. | Trial plan currently includes calling (`feature-gate.ts`, per the audit). |
| Number purchase | Only after KYC documents are approved for that country. Show the monthly price before buying. | Purchase works for Twilio local numbers only. |
| Number release | Release at the provider when an agency cancels or stops paying, after a grace period, and tell them first: a released number is usually gone for good. | Delete does not release. |
| Emergency calls | State in the terms and in the app that the softphone cannot call emergency services. Twilio says outright that emergency calls are not supported in India and the UAE [S10, S12]. In the US and UK, internet phone services carry emergency-calling duties: ask the lawyer whether a CRM softphone falls under them. | Nothing. |
| Recording consent | Announcement before recording, on by default. Rules differ by country: needs legal confirmation per market. | Records silently. |
| Recording storage | Move recordings off the provider into our own storage with a retention period. | Stays at the provider. |
| Provider terms | Both providers' public terms allow calling as a feature of our product and forbid selling it on its own. **Twilio** (section 2.2): you may not "transfer, resell, lease, license, or otherwise make available the Services to third parties" except "to make the Services available to your End Users", nor "offer them on a standalone basis"; you are "solely responsible for all acts, omissions, and activities of your End Users" [S37]. **Plivo** (section 2.1): you may "integrate the Services into any Customer Application that has material value independent of the Services"; you must "ensure that your customers adhere to our policies"; usage from fraud on your application "will be your own responsibility"; the services are not for emergency calls [S39]. So: sell calling only as part of the CRM, never as bare minutes; pass the providers' acceptable-use rules on to agencies in our terms; still get written confirmation for India, where KYC changes the picture. | Our terms do not exist yet. |
| Our own terms | Acceptable use, no cold calling, no emergency calls, recording responsibility sits with the agency, balance is non-refundable or refundable (decide), what happens to numbers on cancellation. | Legal pages are dead links. |
| Tax on telecom resale | **Flag for the accountant.** India: GST on the resold service. US: federal and state telecom charges can apply to resold voice. UK and EU: VAT on telecom services follows the customer's country. None of this was sourced here. | Invoices always compute Indian GST. |
| Stored credentials | Provider keys and tokens encrypted, not plain text. | Plain text in the database (per the audit). |

## 8. Risks and how each is handled

| Risk | Effect | Handling |
|---|---|---|
| Plivo says the platform may not hold Indian numbers for agencies, or a lawyer says a licence is needed | Reseller model fails in India | Fall back to OWN ACCOUNT ONLY: each agency opens its own Plivo India or Exotel account and pastes its keys (the per-agency credential columns already exist). Ask before building. |
| Plivo does not allow the softphone on Indian domestic routes | No in-app calling in India | Call-bridge is the launch design anyway. |
| Toll fraud through a hijacked agency login | A bill of thousands of dollars in hours | Prepaid balances, country allow-list, rate limits, spend alerts, no calling on trials. The balance caps the loss per agency. |
| Provider suspends the platform account because of one agency's behaviour | Every agency loses calling | One sub-account per agency so one can be suspended alone; acceptable-use terms; second provider already integrated. |
| Two providers to maintain | More work for a small team | Add Twilio only when the first agency in Germany or Malaysia is ready to pay. Until then it is Plivo alone. |
| Prices change | Margin shrinks | Retail prices live in a table the owner can edit; review quarterly. |
| Exchange rate | Providers bill in dollars outside India; Indian plans are in rupees | Bill non-Indian agencies in their own currency or dollars; India is billed by Plivo in rupees. |
| Call quality on poor office internet | Agents blame the product | A call-quality test on first setup; call-bridge offered as a fallback everywhere. |
| Number documents rejected | An agency cannot get a number | Collect documents inside the app before purchase; set expectations that approval takes days. |
| Recording or privacy complaint | Legal exposure | Consent announcement on by default, retention limits, role-based access (see `docs/CALL-AUTOMATION.md` 3.5 and 3.7). |

## 9. What would change the decision

- **Plivo refuses the reseller arrangement in India**, or the softphone there: India becomes OWN ACCOUNT ONLY, and Exotel (licensed, with a softphone SDK) becomes the recommended provider for agencies to sign up with.
- **Twilio launches domestic Indian calling**: re-run section 3. One provider everywhere would be worth paying somewhat more for.
- **Telnyx's rate sheet shows 30% or more below Plivo** on UK and Australian mobile routes: add Telnyx as the third adapter for those routes.
- **Most target agencies are in Germany, Malaysia or the Gulf rather than India, the UK and the US**: Twilio becomes the main provider.
- **Volume passes about one million minutes a month and a telecom engineer is on the team**: revisit self-hosting.
- **The owner decides calling is not worth the regulatory work**: ship without calling, keep manual call logging, and lean on WhatsApp, which is where most Indian travel enquiries arrive anyway.

## 9a. Decisions the owner must make (gate G1)

1. **Provider.** Accept Plivo first, Twilio second (Germany, Malaysia), instead of Twilio first?
2. **India launch shape.** Launch with call-bridge now, and add the softphone only after Plivo's written answer? Or hold calling in India until the softphone is confirmed?
3. **India legal check.** Pay for a telecom lawyer's opinion on whether reselling numbers needs a licence, before building? If the answer is "needs a licence", accept OWN ACCOUNT ONLY for India (each agency signs up with Plivo India or Exotel)?
4. **Countries without calling.** Accept no calling at launch in the UAE, Saudi Arabia, Qatar, Thailand, Sri Lanka, Nepal and Bangladesh?
5. **Prepaid balance.** Calls, numbers, SMS and marketing WhatsApp from one prepaid balance, never bundled without a limit? Is an unused balance refundable?
6. **Retail prices.** Approve the per-minute prices and bundles in `docs/COST-MODEL.md` section 6 (India ₹1.50 a minute, ₹299 a number, ₹599 bundle).
7. **Trials.** No calling on free trials?
8. **Recording.** On by default with an announcement, 90-day retention? Or off by default?
9. **Call AI.** Off by default, cheaper transcription engine as standard, premium engine as an option, after a 20-call quality test?
10. **Which company signs.** Plivo India needs an India-registered business with GST registration. Which entity holds the provider accounts and bills foreign agencies?

Related decisions that sit in the cost model: per-user pricing, SMS out of Indian plans, WhatsApp direct through Meta, login codes off SMS, Basic's AI allowance, one shared website installation.

## 10. Questions for vendors and what I could not source

Ask Plivo, in writing:

1. May a software platform rent Indian numbers and give one to each of its customers under sub-accounts? In whose name is KYC done?
2. Is the Browser SDK allowed on Indian domestic routes when the agent is in India? Does it meet the media-anchoring rule?
3. Is the India account separate from the international account? Are sub-accounts available in both? Is there a limit on their number?
4. Are call records and charges available per sub-account through the API? Are there spend limits or alerts per sub-account?
5. Australia: are the prices on the Australia page in US or Australian dollars?
6. Singapore and the UK: what documents does each agency need for a local number?
7. Volume discounts at 10,000, 100,000 and 1,000,000 minutes a month.

Ask Twilio: the Saudi Arabia voice guidelines; Singapore local number and inbound prices; confirmation that sub-accounts may be given to our customers; usage triggers per sub-account.

Ask Telnyx: the international rate sheet; local number countries; managed-account billing.

Ask a telecom lawyer in India: whether the reseller model needs a UL-VNO licence; the current OSP position; recording consent. In the UAE, Saudi Arabia and Qatar: whether any form of resold business calling is possible.

Not found in this research: Telnyx prices outside the US and its managed-account terms; Twilio's UAE, Saudi, Qatar, Sri Lanka, Nepal, Bangladesh and Singapore number and inbound prices; Plivo's sub-account limit and per-sub-account call records; Exotel's per-minute rates; the text of India's current OSP guidelines; the UAE regulator's own policy page; any Saudi or Qatari rule on reselling business calling; emergency-calling duties for a softphone in the US and UK; tax treatment of resold calls in any country.

## 11. Sources

All retrieved 2026-10-09.

- [S1] Twilio voice pricing, India: https://www.twilio.com/en-us/voice/pricing/in
- [S2] Twilio voice pricing, UK: https://www.twilio.com/en-us/voice/pricing/gb
- [S3] Twilio voice pricing, Germany: https://www.twilio.com/en-us/voice/pricing/de
- [S4] Twilio voice pricing, US: https://www.twilio.com/en-us/voice/pricing/us
- [S5] Twilio voice pricing, Australia: https://www.twilio.com/en-us/voice/pricing/au
- [S6] Twilio voice pricing, UAE: https://www.twilio.com/en-us/voice/pricing/ae
- [S7] Twilio voice pricing, Saudi Arabia: https://www.twilio.com/en-us/voice/pricing/sa
- [S8] Twilio voice pricing, Singapore: https://www.twilio.com/en-us/voice/pricing/sg
- [S9] Twilio voice pricing, Malaysia: https://www.twilio.com/en-us/voice/pricing/my
- [S10] Twilio India voice guidelines: https://www.twilio.com/en-us/guidelines/in/voice
- [S11] TRAI documents on internet telephony and OSP terms (found by search; the passages quoted are from the search summary of these files): https://trai.gov.in/sites/default/files/2024-11/RecommendationIT16072018.pdf and https://www.trai.gov.in/sites/default/files/2024-09/Regulation_10072020_0.pdf
- [S12] Twilio UAE voice guidelines: https://www.twilio.com/en-us/guidelines/ae/voice
- [S13] UAE regulator position as reported: https://gulfnews.com/business/ban-on-voip-services-to-continue-says-tra-1.90797 , https://khaleejtimes.com/uae/viber-illegal-to-use-in-country-affirms-tra , https://gulfbusiness.com/en/2014/industry/voip-services-skype-viber-illegal-uae-clarifies-regulator/
- [S13b] Saudi Arabia lifting the ban on internet calls, 2017: https://bbc.in/2p5Cxkj , https://fortune.com/2017/09/20/saudi-arabia-internet-phone-calls-ban
- [S14] Khaitan & Co on the OSP recommendations: https://khaitanco.com/thought-leaderships/A-silver-lining-for-Other-Service-Providers
- [S15] Plivo voice pricing, India: https://www.plivo.com/voice/pricing/in/
- [S16] Plivo, calling in India: https://www.plivo.com/docs/voice/concepts/india-calling
- [S17] Plivo support, domestic calling in India (via search summary): https://support.plivo.com/hc/en-us/articles/16859884362265
- [S18] Plivo voice pricing, UK: https://www.plivo.com/voice/pricing/gb/
- [S19] Plivo voice pricing, US: https://www.plivo.com/voice/pricing/us/
- [S20] Plivo voice pricing, Germany: https://www.plivo.com/voice/pricing/de/
- [S21] Plivo voice pricing, Australia: https://www.plivo.com/voice/pricing/au/
- [S22] Plivo voice pricing, UAE: https://www.plivo.com/voice/pricing/ae/
- [S23] Plivo voice pricing, Saudi Arabia: https://www.plivo.com/voice/pricing/sa/
- [S24] Plivo voice pricing, Singapore and Malaysia: https://www.plivo.com/voice/pricing/sg/ , https://www.plivo.com/voice/pricing/my/
- [S25] Telnyx Voice API pricing: https://telnyx.com/pricing/voice-api
- [S26] Twilio sub-accounts: https://www.twilio.com/docs/iam/api/subaccounts
- [S27] Exotel plans as reported by a third party: https://www.cloudtalk.io/blog/exotel-pricing/ ; Exotel's own page has no figures: https://exotel.com/pricing/
- [S28] UL-VNO licences: https://tele.net.in/exotel-receives-pan-india-vno-licence/ , https://tele.net.in/genesys-cloud-secures-a-ul-vno-license-in-india/
- [S29] Exotel softphone SDK: https://docs.exotel.com/voice-apis/ip-pstn-intermix-customer-onboarding-and-webrtc-sdk-integration
- [S30] Twilio UK number requirements: https://www.twilio.com/en-us/guidelines/gb/regulatory
- [S31] Twilio Germany number requirements: https://www.twilio.com/en-us/guidelines/de/regulatory
- [S32] Twilio Australia number requirements: https://www.twilio.com/en-us/guidelines/au/regulatory
- [S33] Twilio Singapore number requirements: https://www.twilio.com/en-us/guidelines/sg/regulatory
- [S34] Twilio Malaysia number requirements: https://www.twilio.com/en-us/guidelines/my/regulatory
- [S35] Twilio `<Dial>` documentation: https://www.twilio.com/docs/voice/twiml/dial
- [S36] Plivo sub-accounts: https://www.plivo.com/docs/account/api/subaccount
- [S37] Twilio terms of service (first 100,000 characters read): https://www.twilio.com/en-us/legal/tos
- [S39] Plivo terms of service: https://www.plivo.com/legal/tos/
- [S41] Twilio voice pricing, Qatar: https://www.twilio.com/en-us/voice/pricing/qa
- [S42] Twilio voice pricing, Thailand: https://www.twilio.com/en-us/voice/pricing/th
- [S43] Twilio voice pricing, Sri Lanka: https://www.twilio.com/en-us/voice/pricing/lk
- [S44] Twilio voice pricing, Nepal: https://www.twilio.com/en-us/voice/pricing/np
- [S45] Twilio voice pricing, Bangladesh: https://www.twilio.com/en-us/voice/pricing/bd
- [S46] Twilio WhatsApp pricing (calling section): https://www.twilio.com/en-us/whatsapp/pricing
- [S38] Oracle Always Free resources: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- [S40] Exchange rates dated 2026-10-08: https://open.er-api.com/v6/latest/USD

## Addendum A (2026-10-14): easier sign-up, Plivo dropped

**What changed.** The owner tried to sign up with Plivo and could not complete it, and asked for "anything better and easy". Ease of opening and running the account now outranks the 39–51% per-minute saving from section 2.2.

**Revised decision (proposed, awaiting owner confirmation):**

| Market | Position at launch | Provider | Why |
|---|---|---|---|
| UK, US, Australia, Singapore | RESELL, in-app softphone | **Twilio**, one sub-account per agency | Self-serve sign-up with a card; the adapter, TwiML endpoints and token code already exist; sub-account usage records give per-agency metering; the Voice JS SDK runs in Electron |
| Germany (EU), Malaysia | RESELL, second wave | Twilio | Unchanged from section 4 |
| India | Agency's **own Exotel account** (OWN ACCOUNT ONLY) in call-bridge mode; platform does not resell | **Exotel** | Twilio does not support domestic Indian numbers or calls (third-party summaries of Twilio's India guidelines; confirm against Twilio's help centre). Exotel is an Indian provider whose `Calls/connect` API rings the agent's phone first and then the customer, showing the agency's virtual number (ExoPhone). Sign-up needs a business email and Indian KYC; a trial starts without a card. Leaving the account with the agency also sidesteps the unresolved question in section 4.1 of whether a platform may hold Indian numbers for others without a telecom licence |
| UAE, Saudi Arabia, Qatar, Thailand, Sri Lanka, Nepal, Bangladesh | NOT OFFERED AT LAUNCH | none | Unchanged from section 4 |

**What this costs.** Twilio's list prices are higher than Plivo's (section 3: a 120-minute agency costs about $7.02 a month in the UK and $3.48 in the US on Twilio). The owner's rule is that communication is resold at provider cost + 20%, so retail call prices are recomputed from Twilio's rates and the margin is unchanged; agencies pay somewhat more per minute than under the Plivo plan. Indian agencies pay Exotel directly, so India calling carries no telephony cost or margin for the platform.

**Later option for cost.** Telnyx (self-serve; international numbers and calling need Level 2 verification, which needs a company name, contact number and a payment method and can take up to 48 hours) can be added behind the same `VoipProvider` interface if call volume makes the saving worth a second provider. Plivo's adapter stays in the code, unused and untested.

**What changes in the build (Tier 3 batches).** R301 keeps the provider-agnostic contract. R304 (sub-accounts and numbers), R305 (metering) and R307 (softphone) target Twilio. R308 (India call bridge) becomes an `ExotelProvider` adapter for call-bridge only, configured with the agency's own Exotel credentials (encrypted per R108), with no platform metering or resale. All provider-specific batches stay blocked on the owner confirming this addendum.

**Owner to confirm (G1, revised):** (1) Twilio for resale outside India; (2) India as the agency's own Exotel account rather than resale; (3) the remaining items from section 9a (prepaid balance, recording default, call AI default, trials without calling).

**Sources (retrieved 2026-10-14):**
- Exotel connect-two-numbers quickstart: https://developer.exotel.com/docs/voice-v1/quickstart
- Exotel sign-up and KYC: https://developer.exotel.com/docs/call-support/basics/getting-started
- Exotel billing model (per-leg pulses): https://developer.exotel.com/docs/billing/pricing-model
- Telnyx account verification levels: https://support.telnyx.com/en/articles/1130595-account-verification and https://developers.telnyx.com/docs/account-setup/levels-and-capabilities
- Telnyx WebRTC JS SDK: https://developers.telnyx.com/docs/voice/webrtc/js-sdk/
- Twilio India restrictions (third-party summary of Twilio's guidelines; Twilio's own page was not reachable): https://support.revenue.io/ringdna/telephony-101/voice-guidelines/india/ ; Twilio India toll-free note: https://support.twilio.com/hc/en-us/articles/40728263317915-India-Toll-Free-Voice-Number-Not-Working-and-Not-Receiving-Calls

## Decision (owner, 2026-10-15)

**Twilio only, and no calling for Indian agencies at launch.** The platform resells Twilio numbers and minutes (one sub-account per agency) in the markets where Twilio can serve them (UK, US, Australia, Singapore first; Germany and Malaysia in a second wave). Calling features are hidden for agencies whose country is India, and for the Gulf, Thailand, Sri Lanka, Nepal and Bangladesh, as in section 4. The Exotel call bridge for India (Addendum A) is not built for v1; it can be revisited later behind the same `VoipProvider` interface. Plivo stays out.

