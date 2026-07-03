import { A2CAccountsSection } from "./A2CAccountsSection.js";
import { ConfigActionsPanel } from "./ConfigActionsPanel.js";
import { ConfigOverviewSection } from "./ConfigOverviewSection.js";
import { CountrySettingsCard } from "./CountrySettingsCard.js";
import { RegistrationTutorialImageCard } from "./RegistrationTutorialImageCard.js";
import { TelegramBindingCard } from "./TelegramBindingCard.js";
import { useConfigController } from "./useConfigController.js";

export function ConfigPage({ platform }: { platform: boolean }) {
  const controller = useConfigController({ platform });

  return <section>
    {platform && <select value={controller.merchantId} onChange={(e) => controller.setMerchantId(e.target.value)}>{controller.merchants.map((m) => <option value={m.id} key={m.id}>{m.name}</option>)}</select>}
    <ConfigOverviewSection form={controller.form} webhookUrl={controller.a2cWebhookUrl} onFormChange={controller.setForm} onCopied={controller.onWebhookCopied} />
    <RegistrationTutorialImageCard imageUrl={controller.form.registrationTutorialImageUrl} file={controller.tutorialImageFile} onFileChange={controller.setTutorialImageFile} onUpload={controller.uploadTutorialImage} />
    <ConfigActionsPanel checks={controller.checks} error={controller.error} message={controller.message} onSave={controller.saveConfig} onSyncA2C={() => controller.syncA2CAccounts()} onCheck={controller.runConfigCheck} />
    <CountrySettingsCard countries={controller.countries} draft={controller.countryDraft} onDraftChange={controller.updateCountryDraft} onLoadCountry={controller.loadCountryDraft} onReInfer={controller.reInferCountryDraft} onSave={controller.saveCountry} />
    <A2CAccountsSection accounts={controller.a2cAccounts} countries={controller.countries} platform={platform} onToggleAccount={controller.toggleA2CAccount} />
    <TelegramBindingCard form={controller.form} onSetup={controller.setupTelegram} onRefresh={controller.refreshTelegramStatus} />
  </section>;
}
