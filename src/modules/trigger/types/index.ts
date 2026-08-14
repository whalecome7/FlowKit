/** 匹配条件 */
export interface TriggerCondition {
  field: 'sender' | 'body';
  matchType: 'contains' | 'regex' | 'equals';
  value: string;
}

/** 触发动作 */
export interface TriggerAction {
  type: 'ringtone' | 'vibrate' | 'notify' | 'pushToWatch';
  params: Record<string, unknown>;
  /** 动作是否启用（false 时执行阶段跳过） */
  enabled?: boolean;
}

/** 规则 */
export interface TriggerRule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: TriggerCondition[];
  actions: TriggerAction[];
  createdAt: number;
}

/** 匹配结果 */
export interface MatchResult {
  rule: TriggerRule;
  matchedConditions: TriggerCondition[];
}

/** 动作执行记录 */
export interface ActionLog {
  type: string;
  success: boolean;
  error?: string;
}

/** 执行日志 */
export interface ExecutionLog {
  id: string;
  ruleId: string;
  ruleName: string;
  smsSender: string;
  smsBody: string;
  triggeredAt: number;
  actions: ActionLog[];
}

/** 动作参数表单定义 */
export interface ActionParamMeta {
  key: string;
  label: string;
  placeholder?: string;
  numeric?: boolean;
  /** 枚举型参数：永不显示自定义输入框 */
  disableInput?: boolean;
  /** 文件选择器：'audio' 表示本地音频文件选择，替换手动输入 */
  filePicker?: 'audio' | 'any';
  /** 预制选项（chips），用户可直接点选，仍保留自定义输入 */
  presets?: { label: string; value: string }[];
  /** 条件显示：仅当另一个参数等于指定值时渲染 */
  showWhen?: { key: string; value: string };
}

/** 动作元数据：驱动编辑 UI 渲染 */
export interface ActionMeta {
  type: TriggerAction['type'];
  label: string;
  params: ActionParamMeta[];
}

export const ACTION_META: ActionMeta[] = [
  {
    type: 'notify',
    label: '状态栏通知',
    params: [
      { key: 'title', label: '标题', placeholder: 'FlowKit 提醒' },
      { key: 'body', label: '正文', placeholder: '收到匹配短信' },
    ],
  },
  {
    type: 'vibrate',
    label: '震动',
    params: [
      {
        key: 'pattern',
        label: '节奏',
        placeholder: '毫秒序列，逗号分隔，如 200,100,300',
        presets: [
          { label: '轻震', value: '100' },
          { label: '标准', value: '300' },
          { label: '急促连震', value: '200,80,200,80,300' },
          { label: '自定义', value: 'custom' },
        ],
      },
      {
        key: 'amplitude',
        label: '力度',
        numeric: true,
        placeholder: '力度 1-255，如 180',
        presets: [
          { label: '轻柔', value: '60' },
          { label: '标准', value: '120' },
          { label: '强力', value: '200' },
          { label: '自定义', value: 'custom' },
        ],
      },
    ],
  },
  {
    type: 'ringtone',
    label: '播放铃声',
    params: [
      {
        key: 'source',
        label: '声音来源',
        disableInput: true,
        presets: [
          { label: '系统默认', value: 'default' },
          { label: '自定义文件', value: 'file' },
          { label: '文字播报', value: 'speech' },
        ],
      },
      {
        key: 'url',
        label: '铃声文件（可选）',
        filePicker: 'audio',
        showWhen: { key: 'source', value: 'file' },
      },
      {
        key: 'speakText',
        label: '播报文字（可选）',
        placeholder: '输入文字将语音播报，留空则播铃声',
        showWhen: { key: 'source', value: 'speech' },
      },
      {
        key: 'rate',
        label: '语速',
        disableInput: true,
        showWhen: { key: 'source', value: 'speech' },
        presets: [
          { label: '慢', value: '0.7' },
          { label: '正常', value: '1.0' },
          { label: '快', value: '1.5' },
        ],
      },
      {
        key: 'pitch',
        label: '音调',
        disableInput: true,
        showWhen: { key: 'source', value: 'speech' },
        presets: [
          { label: '低沉', value: '0.7' },
          { label: '正常', value: '1.0' },
          { label: '高昂', value: '1.3' },
        ],
      },
      { key: 'duration', label: '响铃时长(ms)', placeholder: '5000', numeric: true },
    ],
  },
  {
    type: 'pushToWatch',
    label: '推送到手表',
    params: [
      { key: 'title', label: '标题', placeholder: 'FlowKit 提醒' },
      { key: 'body', label: '正文', placeholder: '收到匹配短信' },
    ],
  },
];

/** 动作类型 → 元数据 查找 */
export function getActionMeta(type: string): ActionMeta | undefined {
  return ACTION_META.find((m) => m.type === type);
}

/** 监听到的短信记录（无论是否命中规则） */
export interface SmsRecord {
  id: string;
  sender: string;
  body: string;
  receivedAt: number;
  /** 命中的规则名列表（未命中为空数组） */
  matchedRuleNames: string[];
}
