import { Flocon } from '@openflocon/react-native';
import '@openflocon/files';
import { Directory, File, Paths } from 'expo-file-system';

import { SampleActionRow, SampleInfoCard, SampleScreenContainer, SampleSection } from '../widgets/SampleWidgets';

function write(directory: Directory, name: string, content: string | Uint8Array): File {
  directory.create({ intermediates: true, idempotent: true });
  const file = new File(directory, name);
  file.write(content);
  return file;
}

/** Writes files in the app folders, to browse, download and delete from the Files section of Flocon. */
export function FilesScreen() {
  return (
    <SampleScreenContainer screen="Files">
      <SampleSection title="Files">
        <SampleActionRow
          title="Write sample files"
          detail="Text and JSON in Documents and Caches"
          buttonTitle="Write"
          action={async () => {
            const now = new Date();
            write(Paths.document, `sample_${now.getTime()}.txt`, `Hello from the Flocon sample\n${now.toISOString()}`);
            write(new Directory(Paths.document, 'exports'), 'export.json', '{"name": "flocon", "items": [1, 2, 3]}');
            write(Paths.document, 'settings.json', '{"theme": "dark", "launches": 1}');
            write(Paths.cache, 'cache.bin', new Uint8Array(256 * 1024).fill(7));
            return '4 files written';
          }}
        />
        <SampleActionRow
          title="Big file"
          detail="5 MB in the caches, to see a streamed download"
          buttonTitle="Write"
          action={async () => write(Paths.cache, 'big.bin', new Uint8Array(5 * 1024 * 1024).fill(7)).uri}
        />
        <SampleActionRow
          title="Register a folder"
          detail='Shows documents/exports as "Exports" next to the default folders'
          buttonTitle="Register"
          action={async () => {
            const exports = new Directory(Paths.document, 'exports');
            exports.create({ intermediates: true, idempotent: true });
            await Flocon.files.register('Exports', exports.uri);
            return exports.uri;
          }}
        />
      </SampleSection>
      <SampleInfoCard text="Browse, download and delete them from Flocon > Files. A download is uploaded to the desktop over HTTPS." />
    </SampleScreenContainer>
  );
}
