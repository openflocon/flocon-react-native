import { SampleActionRow, SampleInfoCard, SampleScreenContainer, SampleSection } from '../widgets/SampleWidgets';

declare const ErrorUtils: { getGlobalHandler(): (error: unknown, isFatal?: boolean) => void };

/**
 * Errors reported to Flocon > Crashes. In a debug build the app keeps running: React Native shows the error, after the
 * handler installed by `FloconCrashReporter` has saved and sent it.
 */
export function CrashScreen() {
  return (
    <SampleScreenContainer screen="Crash">
      <SampleSection title="Errors">
        <SampleActionRow
          title="Error in a callback"
          detail="Thrown out of a timer, to the global handler"
          buttonTitle="Throw"
          isDestructive
          action={async () => {
            setTimeout(() => {
              throw new TypeError('Sample error from a callback');
            }, 100);
            return 'thrown in a timer';
          }}
        />
        <SampleActionRow
          title="Reported error"
          detail="Given to the global handler as not fatal"
          buttonTitle="Report"
          isDestructive
          action={async () => {
            ErrorUtils.getGlobalHandler()(new RangeError('Sample error reported by the app'), false);
            return 'reported';
          }}
        />
      </SampleSection>
      <SampleInfoCard text="Each error shows up in Flocon > Crashes with its stack trace. Native crashes (Kotlin, Swift) are not reported." />
    </SampleScreenContainer>
  );
}
