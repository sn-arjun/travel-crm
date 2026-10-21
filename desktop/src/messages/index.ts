/**
 * The interface catalogues, one JSON file per top-level key namespace (the first dot segment of a key:
 * `nav.items.leads` lives in <lang>/nav.json). Every file is imported statically and merged into one flat
 * catalogue per language, which lib/i18n.ts uses. Batches that add strings edit only their own namespace
 * files, so they never collide on one big file. scripts/i18n-check.mjs fails a key placed in the wrong file.
 *
 * A new namespace needs a file in every language folder and an entry here.
 */
export type Catalogue = Record<string, string>;

import en_nav from './en/nav.json';
import en_common from './en/common.json';
import en_status from './en/status.json';
import en_leads from './en/leads.json';
import en_contacts from './en/contacts.json';
import en_invoices from './en/invoices.json';
import en_settings from './en/settings.json';
import en_dashboard from './en/dashboard.json';
import en_calendar from './en/calendar.json';
import en_reports from './en/reports.json';
import en_tasks from './en/tasks.json';
import en_fleet from './en/fleet.json';
import en_suppliers from './en/suppliers.json';
import en_vouchers from './en/vouchers.json';
import en_validation from './en/validation.json';
import en_actions from './en/actions.json';
import en_messages from './en/messages.json';
import en_itineraries from './en/itineraries.json';
import en_shell from './en/shell.json';
import en_brand from './en/brand.json';
import en_ui from './en/ui.json';
import en_auth from './en/auth.json';
import en_softphone from './en/softphone.json';
import en_usage from './en/usage.json';
import en_departures from './en/departures.json';
import en_tours from './en/tours.json';
import en_groupTours from './en/groupTours.json';
import en_booking from './en/booking.json';
import en_trip from './en/trip.json';
import en_extras from './en/extras.json';
import en_coachTrips from './en/coachTrips.json';
import en_payments from './en/payments.json';
import en_quotes from './en/quotes.json';
import en_chatbot from './en/chatbot.json';
import en_pipeline from './en/pipeline.json';
import en_ageBands from './en/ageBands.json';
import en_margin from './en/margin.json';
import en_calling from './en/calling.json';
import en_departureMessages from './en/departureMessages.json';
import en_banks from './en/banks.json';
import en_followUps from './en/followUps.json';
import en_travellers from './en/travellers.json';
import en_visa from './en/visa.json';
import en_documents from './en/documents.json';
import en_rateCards from './en/rateCards.json';
import en_creditNotes from './en/creditNotes.json';
import en_debitNotes from './en/debitNotes.json';
import en_marketing from './en/marketing.json';
import en_campaigns from './en/campaigns.json';
import en_communication from './en/communication.json';
import en_ai from './en/ai.json';
import en_assistant from './en/assistant.json';
import en_import from './en/import.json';
import en_onboarding from './en/onboarding.json';
import en_help from './en/help.json';
import en_notifications from './en/notifications.json';
import en_accounts from './en/accounts.json';
import en_bookmarks from './en/bookmarks.json';
import en_publicPages from './en/publicPages.json';
import en_inbox from './en/inbox.json';
import hi_nav from './hi/nav.json';
import hi_common from './hi/common.json';
import hi_status from './hi/status.json';
import hi_leads from './hi/leads.json';
import hi_contacts from './hi/contacts.json';
import hi_invoices from './hi/invoices.json';
import hi_settings from './hi/settings.json';
import hi_dashboard from './hi/dashboard.json';
import hi_calendar from './hi/calendar.json';
import hi_reports from './hi/reports.json';
import hi_tasks from './hi/tasks.json';
import hi_fleet from './hi/fleet.json';
import hi_suppliers from './hi/suppliers.json';
import hi_vouchers from './hi/vouchers.json';
import hi_validation from './hi/validation.json';
import hi_actions from './hi/actions.json';
import hi_messages from './hi/messages.json';
import hi_itineraries from './hi/itineraries.json';
import hi_shell from './hi/shell.json';
import hi_brand from './hi/brand.json';
import hi_ui from './hi/ui.json';
import hi_auth from './hi/auth.json';
import hi_softphone from './hi/softphone.json';
import hi_usage from './hi/usage.json';
import hi_departures from './hi/departures.json';
import hi_tours from './hi/tours.json';
import hi_groupTours from './hi/groupTours.json';
import hi_booking from './hi/booking.json';
import hi_trip from './hi/trip.json';
import hi_extras from './hi/extras.json';
import hi_coachTrips from './hi/coachTrips.json';
import hi_payments from './hi/payments.json';
import hi_quotes from './hi/quotes.json';
import hi_chatbot from './hi/chatbot.json';
import hi_pipeline from './hi/pipeline.json';
import hi_ageBands from './hi/ageBands.json';
import hi_margin from './hi/margin.json';
import hi_calling from './hi/calling.json';
import hi_departureMessages from './hi/departureMessages.json';
import hi_banks from './hi/banks.json';
import hi_followUps from './hi/followUps.json';
import hi_travellers from './hi/travellers.json';
import hi_visa from './hi/visa.json';
import hi_documents from './hi/documents.json';
import hi_rateCards from './hi/rateCards.json';
import hi_creditNotes from './hi/creditNotes.json';
import hi_debitNotes from './hi/debitNotes.json';
import hi_marketing from './hi/marketing.json';
import hi_campaigns from './hi/campaigns.json';
import hi_communication from './hi/communication.json';
import hi_ai from './hi/ai.json';
import hi_assistant from './hi/assistant.json';
import hi_import from './hi/import.json';
import hi_onboarding from './hi/onboarding.json';
import hi_help from './hi/help.json';
import hi_notifications from './hi/notifications.json';
import hi_accounts from './hi/accounts.json';
import hi_bookmarks from './hi/bookmarks.json';
import hi_publicPages from './hi/publicPages.json';
import hi_inbox from './hi/inbox.json';
import ar_nav from './ar/nav.json';
import ar_common from './ar/common.json';
import ar_status from './ar/status.json';
import ar_leads from './ar/leads.json';
import ar_contacts from './ar/contacts.json';
import ar_invoices from './ar/invoices.json';
import ar_settings from './ar/settings.json';
import ar_dashboard from './ar/dashboard.json';
import ar_calendar from './ar/calendar.json';
import ar_reports from './ar/reports.json';
import ar_tasks from './ar/tasks.json';
import ar_fleet from './ar/fleet.json';
import ar_suppliers from './ar/suppliers.json';
import ar_vouchers from './ar/vouchers.json';
import ar_validation from './ar/validation.json';
import ar_actions from './ar/actions.json';
import ar_messages from './ar/messages.json';
import ar_itineraries from './ar/itineraries.json';
import ar_shell from './ar/shell.json';
import ar_brand from './ar/brand.json';
import ar_ui from './ar/ui.json';
import ar_auth from './ar/auth.json';
import ar_softphone from './ar/softphone.json';
import ar_usage from './ar/usage.json';
import ar_departures from './ar/departures.json';
import ar_tours from './ar/tours.json';
import ar_groupTours from './ar/groupTours.json';
import ar_booking from './ar/booking.json';
import ar_trip from './ar/trip.json';
import ar_extras from './ar/extras.json';
import ar_coachTrips from './ar/coachTrips.json';
import ar_payments from './ar/payments.json';
import ar_quotes from './ar/quotes.json';
import ar_chatbot from './ar/chatbot.json';
import ar_pipeline from './ar/pipeline.json';
import ar_ageBands from './ar/ageBands.json';
import ar_margin from './ar/margin.json';
import ar_calling from './ar/calling.json';
import ar_departureMessages from './ar/departureMessages.json';
import ar_banks from './ar/banks.json';
import ar_followUps from './ar/followUps.json';
import ar_travellers from './ar/travellers.json';
import ar_visa from './ar/visa.json';
import ar_documents from './ar/documents.json';
import ar_rateCards from './ar/rateCards.json';
import ar_creditNotes from './ar/creditNotes.json';
import ar_debitNotes from './ar/debitNotes.json';
import ar_marketing from './ar/marketing.json';
import ar_campaigns from './ar/campaigns.json';
import ar_communication from './ar/communication.json';
import ar_ai from './ar/ai.json';
import ar_assistant from './ar/assistant.json';
import ar_import from './ar/import.json';
import ar_onboarding from './ar/onboarding.json';
import ar_help from './ar/help.json';
import ar_notifications from './ar/notifications.json';
import ar_accounts from './ar/accounts.json';
import ar_bookmarks from './ar/bookmarks.json';
import ar_publicPages from './ar/publicPages.json';
import ar_inbox from './ar/inbox.json';
import nl_nav from './nl/nav.json';
import nl_common from './nl/common.json';
import nl_status from './nl/status.json';
import nl_leads from './nl/leads.json';
import nl_contacts from './nl/contacts.json';
import nl_invoices from './nl/invoices.json';
import nl_settings from './nl/settings.json';
import nl_dashboard from './nl/dashboard.json';
import nl_calendar from './nl/calendar.json';
import nl_reports from './nl/reports.json';
import nl_tasks from './nl/tasks.json';
import nl_fleet from './nl/fleet.json';
import nl_suppliers from './nl/suppliers.json';
import nl_vouchers from './nl/vouchers.json';
import nl_validation from './nl/validation.json';
import nl_actions from './nl/actions.json';
import nl_messages from './nl/messages.json';
import nl_itineraries from './nl/itineraries.json';
import nl_shell from './nl/shell.json';
import nl_brand from './nl/brand.json';
import nl_ui from './nl/ui.json';
import nl_auth from './nl/auth.json';
import nl_softphone from './nl/softphone.json';
import nl_usage from './nl/usage.json';
import nl_departures from './nl/departures.json';
import nl_tours from './nl/tours.json';
import nl_groupTours from './nl/groupTours.json';
import nl_booking from './nl/booking.json';
import nl_trip from './nl/trip.json';
import nl_extras from './nl/extras.json';
import nl_coachTrips from './nl/coachTrips.json';
import nl_payments from './nl/payments.json';
import nl_quotes from './nl/quotes.json';
import nl_chatbot from './nl/chatbot.json';
import nl_pipeline from './nl/pipeline.json';
import nl_ageBands from './nl/ageBands.json';
import nl_margin from './nl/margin.json';
import nl_calling from './nl/calling.json';
import nl_departureMessages from './nl/departureMessages.json';
import nl_banks from './nl/banks.json';
import nl_followUps from './nl/followUps.json';
import nl_travellers from './nl/travellers.json';
import nl_visa from './nl/visa.json';
import nl_documents from './nl/documents.json';
import nl_rateCards from './nl/rateCards.json';
import nl_creditNotes from './nl/creditNotes.json';
import nl_debitNotes from './nl/debitNotes.json';
import nl_marketing from './nl/marketing.json';
import nl_campaigns from './nl/campaigns.json';
import nl_communication from './nl/communication.json';
import nl_ai from './nl/ai.json';
import nl_assistant from './nl/assistant.json';
import nl_import from './nl/import.json';
import nl_onboarding from './nl/onboarding.json';
import nl_help from './nl/help.json';
import nl_notifications from './nl/notifications.json';
import nl_accounts from './nl/accounts.json';
import nl_bookmarks from './nl/bookmarks.json';
import nl_publicPages from './nl/publicPages.json';
import nl_inbox from './nl/inbox.json';

export const en: Catalogue = {
  ...en_nav,
  ...en_common,
  ...en_status,
  ...en_leads,
  ...en_contacts,
  ...en_invoices,
  ...en_settings,
  ...en_dashboard,
  ...en_calendar,
  ...en_reports,
  ...en_tasks,
  ...en_fleet,
  ...en_suppliers,
  ...en_vouchers,
  ...en_validation,
  ...en_actions,
  ...en_messages,
  ...en_itineraries,
  ...en_shell,
  ...en_brand,
  ...en_ui,
  ...en_auth,
  ...en_softphone,
  ...en_usage,
  ...en_departures,
  ...en_tours,
  ...en_groupTours,
  ...en_booking,
  ...en_trip,
  ...en_extras,
  ...en_coachTrips,
  ...en_payments,
  ...en_quotes,
  ...en_chatbot,
  ...en_pipeline,
  ...en_ageBands,
  ...en_margin,
  ...en_calling,
  ...en_departureMessages,
  ...en_banks,
  ...en_followUps,
  ...en_travellers,
  ...en_visa,
  ...en_documents,
  ...en_rateCards,
  ...en_creditNotes,
  ...en_debitNotes,
  ...en_marketing,
  ...en_campaigns,
  ...en_communication,
  ...en_ai,
  ...en_assistant,
  ...en_import,
  ...en_onboarding,
  ...en_help,
  ...en_notifications,
  ...en_accounts,
  ...en_bookmarks,
  ...en_publicPages,
  ...en_inbox,
};

export const hi: Catalogue = {
  ...hi_nav,
  ...hi_common,
  ...hi_status,
  ...hi_leads,
  ...hi_contacts,
  ...hi_invoices,
  ...hi_settings,
  ...hi_dashboard,
  ...hi_calendar,
  ...hi_reports,
  ...hi_tasks,
  ...hi_fleet,
  ...hi_suppliers,
  ...hi_vouchers,
  ...hi_validation,
  ...hi_actions,
  ...hi_messages,
  ...hi_itineraries,
  ...hi_shell,
  ...hi_brand,
  ...hi_ui,
  ...hi_auth,
  ...hi_softphone,
  ...hi_usage,
  ...hi_departures,
  ...hi_tours,
  ...hi_groupTours,
  ...hi_booking,
  ...hi_trip,
  ...hi_extras,
  ...hi_coachTrips,
  ...hi_payments,
  ...hi_quotes,
  ...hi_chatbot,
  ...hi_pipeline,
  ...hi_ageBands,
  ...hi_margin,
  ...hi_calling,
  ...hi_departureMessages,
  ...hi_banks,
  ...hi_followUps,
  ...hi_travellers,
  ...hi_visa,
  ...hi_documents,
  ...hi_rateCards,
  ...hi_creditNotes,
  ...hi_debitNotes,
  ...hi_marketing,
  ...hi_campaigns,
  ...hi_communication,
  ...hi_ai,
  ...hi_assistant,
  ...hi_import,
  ...hi_onboarding,
  ...hi_help,
  ...hi_notifications,
  ...hi_accounts,
  ...hi_bookmarks,
  ...hi_publicPages,
  ...hi_inbox,
};

export const ar: Catalogue = {
  ...ar_nav,
  ...ar_common,
  ...ar_status,
  ...ar_leads,
  ...ar_contacts,
  ...ar_invoices,
  ...ar_settings,
  ...ar_dashboard,
  ...ar_calendar,
  ...ar_reports,
  ...ar_tasks,
  ...ar_fleet,
  ...ar_suppliers,
  ...ar_vouchers,
  ...ar_validation,
  ...ar_actions,
  ...ar_messages,
  ...ar_itineraries,
  ...ar_shell,
  ...ar_brand,
  ...ar_ui,
  ...ar_auth,
  ...ar_softphone,
  ...ar_usage,
  ...ar_departures,
  ...ar_tours,
  ...ar_groupTours,
  ...ar_booking,
  ...ar_trip,
  ...ar_extras,
  ...ar_coachTrips,
  ...ar_payments,
  ...ar_quotes,
  ...ar_chatbot,
  ...ar_pipeline,
  ...ar_ageBands,
  ...ar_margin,
  ...ar_calling,
  ...ar_departureMessages,
  ...ar_banks,
  ...ar_followUps,
  ...ar_travellers,
  ...ar_visa,
  ...ar_documents,
  ...ar_rateCards,
  ...ar_creditNotes,
  ...ar_debitNotes,
  ...ar_marketing,
  ...ar_campaigns,
  ...ar_communication,
  ...ar_ai,
  ...ar_assistant,
  ...ar_import,
  ...ar_onboarding,
  ...ar_help,
  ...ar_notifications,
  ...ar_accounts,
  ...ar_bookmarks,
  ...ar_publicPages,
  ...ar_inbox,
};

export const nl: Catalogue = {
  ...nl_nav,
  ...nl_common,
  ...nl_status,
  ...nl_leads,
  ...nl_contacts,
  ...nl_invoices,
  ...nl_settings,
  ...nl_dashboard,
  ...nl_calendar,
  ...nl_reports,
  ...nl_tasks,
  ...nl_fleet,
  ...nl_suppliers,
  ...nl_vouchers,
  ...nl_validation,
  ...nl_actions,
  ...nl_messages,
  ...nl_itineraries,
  ...nl_shell,
  ...nl_brand,
  ...nl_ui,
  ...nl_auth,
  ...nl_softphone,
  ...nl_usage,
  ...nl_departures,
  ...nl_tours,
  ...nl_groupTours,
  ...nl_booking,
  ...nl_trip,
  ...nl_extras,
  ...nl_coachTrips,
  ...nl_payments,
  ...nl_quotes,
  ...nl_chatbot,
  ...nl_pipeline,
  ...nl_ageBands,
  ...nl_margin,
  ...nl_calling,
  ...nl_departureMessages,
  ...nl_banks,
  ...nl_followUps,
  ...nl_travellers,
  ...nl_visa,
  ...nl_documents,
  ...nl_rateCards,
  ...nl_creditNotes,
  ...nl_debitNotes,
  ...nl_marketing,
  ...nl_campaigns,
  ...nl_communication,
  ...nl_ai,
  ...nl_assistant,
  ...nl_import,
  ...nl_onboarding,
  ...nl_help,
  ...nl_notifications,
  ...nl_accounts,
  ...nl_bookmarks,
  ...nl_publicPages,
  ...nl_inbox,
};

export const messages = { en, hi, ar, nl };
