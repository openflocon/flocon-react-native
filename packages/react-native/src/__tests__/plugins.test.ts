import { FloconAnalyticsPlugin } from '../plugins/analytics/analyticsPlugin';
import { FloconSection, FloconForm } from '../plugins/dashboard/dashboardContent';
import {
  FloconButton,
  FloconCheckBox,
  FloconHtml,
  FloconJson,
  FloconLabel,
  FloconMarkdown,
  FloconPlainText,
  FloconText,
  FloconTextField,
} from '../plugins/dashboard/dashboardElements';
import { FloconDashboardPlugin } from '../plugins/dashboard/dashboardPlugin';
import { FloconDeeplinksPlugin } from '../plugins/deeplinks/deeplinksPlugin';
import { FloconFeatureFlagsPlugin } from '../plugins/featureFlags/featureFlagsPlugin';
import { FloconTablePlugin } from '../plugins/table/tablePlugin';
import { FloconTimelinePlugin } from '../plugins/timeline/timelinePlugin';
import { recordingSender } from './support/nodePlatform';

const msg = (method: string, body: unknown) => ({
  plugin: 'dashboard',
  method,
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('analytics sends one JSON array on plugin analytics, and ignores empty lists', () => {
  const sender = recordingSender();
  const plugin = new FloconAnalyticsPlugin(sender);
  plugin.registerAnalytics('firebase', [], new Date(1000));
  plugin.registerAnalytics(
    'firebase',
    [{ eventName: 'a', properties: [{ name: 'k', value: 'v' }] }, { eventName: 'b' }],
    new Date(1000),
  );
  expect(sender.messages.map((m) => [m.plugin, m.method])).toEqual([['analytics', 'add_items']]);
  const [items] = sender.bodies();
  expect(items).toHaveLength(2);
  expect(items[0]).toEqual({
    id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    analytics_table_id: 'firebase',
    event_name: 'a',
    created_at: 1000,
    properties: [{ name: 'k', value: 'v' }],
  });
  expect(items[1].properties).toEqual([]);
});

test('table sends a one-element JSON array on plugin table', () => {
  const sender = recordingSender();
  new FloconTablePlugin(sender).registerTable('users', { name: 'Flo', age: '33' }, { id: 'r1', createdAt: new Date(5) });
  expect(sender.messages[0].method).toBe('add_items');
  expect(sender.bodies()[0]).toEqual([
    {
      id: 'r1',
      name: 'users',
      createdAt: 5,
      columns: [
        { column: 'name', value: 'Flo' },
        { column: 'age', value: '33' },
      ],
    },
  ]);
});

test('timeline: typed events have no level, tagged ones always have one, params only when present', () => {
  const sender = recordingSender();
  const plugin = new FloconTimelinePlugin(sender, () => new Date(42));
  plugin.send({ type: 'navigation', value: 'Home' });
  plugin.send({ type: 'billing', value: 'failed', params: { sku: 'x' }, level: 'error' });
  expect(sender.messages.map((m) => m.method)).toEqual(['log', 'log']);
  expect(sender.bodies()).toEqual([
    { type: 'navigation', value: 'Home', timestamp: 42 },
    { type: 'billing', value: 'failed', params: { sku: 'x' }, level: 'error', timestamp: 42 },
  ]);
});

test('feature flags replace the ones of a provider and are sent again on connection, sorted by provider', () => {
  const sender = recordingSender();
  const plugin = new FloconFeatureFlagsPlugin(sender);
  plugin.register('statsig', [{ name: 'a', state: 'on', variant: 'on' }]);
  plugin.register('firebase', [{ name: 'b', state: 'custom', variant: 'treatment', payload: '{"steps":3}' }]);
  plugin.register('statsig', [{ name: 'c', state: 'off', variant: 'off' }]);
  sender.messages.length = 0;
  plugin.onConnectedToServer();
  expect(sender.messages.map((m) => m.method)).toEqual(['register', 'register']);
  expect(sender.bodies()).toEqual([
    { provider: 'firebase', flags: [{ name: 'b', state: 'custom', variant: 'treatment', payload: '{"steps":3}' }] },
    { provider: 'statsig', flags: [{ name: 'c', state: 'off', variant: 'off' }] },
  ]);
});

test('deeplinks are sent in the desktop format, and again on connection', () => {
  const sender = recordingSender();
  const plugin = new FloconDeeplinksPlugin(sender);
  plugin.onConnectedToServer();
  expect(sender.messages).toHaveLength(0);
  plugin.register(
    [
      { link: 'myapp://home', label: 'Home' },
      {
        link: 'myapp://user/[userId]',
        description: 'A user',
        parameters: [{ type: 'autoComplete', name: 'userId', suggestions: ['Florent'] }],
      },
      { link: 'myapp://[env]/settings', parameters: [{ type: 'variable', name: 'env', variableName: 'env' }] },
    ],
    [{ name: 'env', suggestions: ['staging'] }, { name: 'free', description: 'd' }],
  );
  plugin.onConnectedToServer();
  expect(sender.messages.map((m) => [m.plugin, m.method])).toEqual([
    ['deeplink', 'get_deeplinks'],
    ['deeplink', 'get_deeplinks'],
  ]);
  expect(sender.bodies()[0]).toEqual({
    deeplinks: [
      { label: 'Home', link: 'myapp://home', parameters: [] },
      {
        link: 'myapp://user/[userId]',
        description: 'A user',
        parameters: [{ type: 'auto_complete', name: 'userId', autoComplete: ['Florent'] }],
      },
      { link: 'myapp://[env]/settings', parameters: [{ type: 'variable', name: 'env', variableName: 'env' }] },
    ],
    variables: [
      { name: 'env', mode: { type: 'auto_complete', suggestions: ['staging'] } },
      { name: 'free', description: 'd' },
    ],
  });
});

describe('dashboard', () => {
  test('a static dashboard is sent once, in the desktop format', () => {
    const sender = recordingSender();
    new FloconDashboardPlugin(sender).dashboard('main', [
      FloconSection('Build', [
        FloconText('status', 'ok', { color: 0xffff0000 }),
        FloconLabel('A label'),
        FloconPlainText('commit', 'abc123'),
        FloconJson('config', '{"a":1}'),
        FloconMarkdown('Release', '# 1.0'),
        FloconHtml('About', '<h1>App</h1>'),
        FloconButton('Log out', { id: 'logout', onClick: () => {} }),
        FloconTextField({ id: 'rename', label: 'Rename', value: 'Flo', placeholder: 'name' }),
        FloconCheckBox({ id: 'premium', label: 'Premium', value: true }),
      ]),
      FloconForm('Create user', [FloconTextField({ id: 'name', label: 'Name', value: '' })], {
        submitText: 'Create',
        onSubmitted: () => {},
      }),
    ]);
    expect(sender.messages.map((m) => [m.plugin, m.method])).toEqual([['dashboard', 'update']]);
    const body = sender.bodies()[0];
    expect(body.dashboardId).toBe('main');
    expect(body.containers[0].containerConfig).toEqual({ containerType: 'SECTION' });
    expect(body.containers[0].elements).toEqual([
      { text: { label: 'status', value: 'ok', color: -65536 } },
      { label: { label: 'A label' } },
      { plainText: { label: 'commit', value: 'abc123', type: 'text' } },
      { plainText: { label: 'config', value: '{"a":1}', type: 'json' } },
      { markdown: { label: 'Release', value: '# 1.0' } },
      { html: { label: 'About', value: '<h1>App</h1>' } },
      { button: { id: 'main_logout', text: 'Log out' } },
      { textField: { id: 'main_rename', label: 'Rename', placeHolder: 'name', value: 'Flo' } },
      { checkBox: { id: 'main_premium', label: 'Premium', value: true } },
    ]);
    expect(body.containers[1].containerConfig).toEqual({
      containerType: 'FORM',
      formId: 'main_form_Create user',
      submitText: 'Create',
    });
  });

  test('actions of the desktop run the callbacks of the app; a form gives back the ids of the app', () => {
    const calls: string[] = [];
    const plugin = new FloconDashboardPlugin(recordingSender());
    plugin.dashboard('main', [
      FloconSection('S', [
        FloconButton('Go', { id: 'go', onClick: () => calls.push('click') }),
        FloconTextField({ id: 'rename', label: 'R', value: '', onSubmitted: (v) => calls.push(`text:${v}`) }),
        FloconCheckBox({ id: 'premium', label: 'P', value: false, onChanged: (v) => calls.push(`check:${v}`) }),
      ]),
      FloconForm('F', [], { submitText: 'Ok', onSubmitted: (values) => calls.push(JSON.stringify(values)) }),
    ]);
    plugin.onMessageReceived(msg('on_click', 'main_go'));
    plugin.onMessageReceived(msg('on_click', '"main_go"'));
    plugin.onMessageReceived(msg('on_text_field_submitted', { id: 'main_rename', value: 'Flo' }));
    plugin.onMessageReceived(msg('on_check_box_value_changed', { id: 'main_premium', value: true }));
    plugin.onMessageReceived(msg('on_form_submitted', { id: 'main_form_F', values: { main_name: 'Flo', main_admin: true } }));
    plugin.onMessageReceived(msg('on_click', 'unknown'));
    plugin.onMessageReceived(msg('on_text_field_submitted', 'not json'));
    expect(calls).toEqual(['click', 'click', 'text:Flo', 'check:true', '{"name":"Flo","admin":"true"}']);
  });

  test('a reactive section sends the dashboard once every block has a value, and stops on dispose', () => {
    const sender = recordingSender();
    const plugin = new FloconDashboardPlugin(sender);
    let emit: ((v: number) => void) | null = null;
    const unsubscribe = jest.fn();
    const handle = plugin.dashboard('main', [
      FloconSection('Static', [FloconLabel('x')]),
      FloconSection.listen<number>(
        'Counter',
        (onChange) => {
          emit = onChange;
          return unsubscribe;
        },
        (v) => [FloconText('count', `${v}`)],
      ),
    ]);
    expect(sender.messages).toHaveLength(0);
    emit!(1);
    emit!(2);
    expect(sender.bodies().map((b) => b.containers[1].elements[0].text.value)).toEqual(['1', '2']);
    plugin.onConnectedToServer();
    expect(sender.messages).toHaveLength(3);
    handle.dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
