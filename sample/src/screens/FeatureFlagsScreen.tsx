import { SampleStartup } from '../startup/sampleState';
import { SampleActionRow, SampleInfoCard, SampleScreenContainer, SampleSection } from '../widgets/SampleWidgets';

export function FeatureFlagsScreen() {
  return (
    <SampleScreenContainer screen="FeatureFlags">
      <SampleSection title="Flags">
        <SampleActionRow
          title="Register flags"
          detail="Firebase and Statsig flags, with variants and payloads"
          buttonTitle="Register"
          action={async () => {
            SampleStartup.registerFeatureFlags();
            return '5 flags, 2 providers';
          }}
        />
        <SampleActionRow
          title="Shuffle variants"
          detail="Registers them again with other variants"
          buttonTitle="Shuffle"
          action={async () => {
            SampleStartup.registerFeatureFlags(true);
            return 'registered again';
          }}
        />
      </SampleSection>
      <SampleInfoCard
        text={
          'Flags are registered when the app starts, and again on each connection. Open Flocon > Feature flags: click a flag to see its ' +
          'payload, then shuffle the variants here and watch them change.'
        }
      />
    </SampleScreenContainer>
  );
}
