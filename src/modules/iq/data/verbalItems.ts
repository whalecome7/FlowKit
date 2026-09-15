import type { VerbalItem } from '../types';

/** 言语类比题池（原创题目）。
 *  全量构成：28 题 = 低龄 14（['6-8','9-11']）+ 中等 6（['9-11','12-16','adult']）+ 高阶 8（['12-16','adult']）
 *  硬性要求：每题只有唯一正确关系；干扰项为「表面相似陷阱」且与答案文本不重复；
 *  低龄题词汇限于小学低年级常用词；成人高阶题可用抽象关系（程度/因果/功能）。 */
export const verbalPool: VerbalItem[] = [
  // ===== 示例 1：低龄·功能（难度 2）=====
  {
    id: 'v01',
    difficulty: 2,
    ageBands: ['6-8', '9-11'],
    relation: 'function',
    a: '笔',
    b: '写字',
    c: '剪刀',
    options: ['裁剪', '锋利', '纸张', '手工'],
    answerIndex: 0,
  },

  // ===== 示例 2：低龄·种属（难度 3）=====
  {
    id: 'v02',
    difficulty: 3,
    ageBands: ['6-8', '9-11'],
    relation: 'category',
    a: '苹果',
    b: '水果',
    c: '玫瑰',
    options: ['花朵', '花园', '红色', '刺'],
    answerIndex: 0,
  },

  // ===== 示例 3：高阶·程度（难度 8）=====
  {
    id: 'v03',
    difficulty: 8,
    ageBands: ['12-16', 'adult'],
    relation: 'degree',
    a: '怀疑',
    b: '确信',
    c: '小溪',
    options: ['大海', '沙滩', '河流', '雨滴'],
    answerIndex: 0,
  },

  // ===== 批 1：低龄·功能 / 种属 / 部分-整体 / 因果（12 题）=====

  // 低龄·功能：工具→用途（洗脸=与「刷牙」同类动作陷阱；拖把=与扫帚同类工具陷阱）
  {
    id: 'v04',
    difficulty: 2,
    ageBands: ['6-8', '9-11'],
    relation: 'function',
    a: '牙刷',
    b: '刷牙',
    c: '扫帚',
    options: ['洗脸', '扫地', '拖把', '干净'],
    answerIndex: 1,
  },

  // 低龄·功能：工具→用途（洗菜=与「切菜」同类动作陷阱；雨鞋=与雨伞同类雨具陷阱）
  {
    id: 'v05',
    difficulty: 2,
    ageBands: ['6-8', '9-11'],
    relation: 'function',
    a: '菜刀',
    b: '切菜',
    c: '雨伞',
    options: ['雨点', '洗菜', '挡雨', '雨鞋'],
    answerIndex: 2,
  },

  // 低龄·种属：个体→类目（火车=与汽车同类的具体物陷阱；动物=与水果同为类别词陷阱）
  {
    id: 'v06',
    difficulty: 3,
    ageBands: ['6-8', '9-11'],
    relation: 'category',
    a: '香蕉',
    b: '水果',
    c: '汽车',
    options: ['火车', '公路', '动物', '交通工具'],
    answerIndex: 3,
  },

  // 低龄·种属：个体→类目（鱼鳞=鲤鱼的部分陷阱；昆虫=与鸟同为动物类别陷阱）
  {
    id: 'v07',
    difficulty: 3,
    ageBands: ['6-8', '9-11'],
    relation: 'category',
    a: '麻雀',
    b: '鸟',
    c: '鲤鱼',
    options: ['鱼', '水池', '鱼鳞', '昆虫'],
    answerIndex: 0,
  },

  // 低龄·种属：个体→类目（跑步=与足球同为运动陷阱；书本=与铅笔同为学习用品陷阱）
  {
    id: 'v08',
    difficulty: 4,
    ageBands: ['6-8', '9-11'],
    relation: 'category',
    a: '铅笔',
    b: '文具',
    c: '足球',
    options: ['操场', '球类', '跑步', '书本'],
    answerIndex: 1,
  },

  // 低龄·部分-整体：部分→整体（袜子/鞋子=穿脚上的关联物陷阱；膝盖=身体部位但非整体）
  {
    id: 'v09',
    difficulty: 1,
    ageBands: ['6-8', '9-11'],
    relation: 'part-whole',
    a: '手指',
    b: '手',
    c: '脚趾',
    options: ['袜子', '鞋子', '脚', '膝盖'],
    answerIndex: 2,
  },

  // 低龄·部分-整体：部分→整体（窗户=与门同为房屋部件陷阱；自行车=与汽车同为交通工具陷阱）
  {
    id: 'v10',
    difficulty: 2,
    ageBands: ['6-8', '9-11'],
    relation: 'part-whole',
    a: '车轮',
    b: '汽车',
    c: '门',
    options: ['钥匙', '窗户', '自行车', '房子'],
    answerIndex: 3,
  },

  // 低龄·部分-整体：部分→整体（树根=与树叶同为树的部分陷阱；果实=与花朵同为植物器官陷阱）
  {
    id: 'v11',
    difficulty: 3,
    ageBands: ['6-8', '9-11'],
    relation: 'part-whole',
    a: '花瓣',
    b: '花朵',
    c: '树叶',
    options: ['大树', '果实', '树根', '秋天'],
    answerIndex: 0,
  },

  // 低龄·部分-整体：部分→整体（按键=键盘的零件但方向相反；打字=功能陷阱；屏幕=双向关联陷阱）
  {
    id: 'v12',
    difficulty: 3,
    ageBands: ['6-8', '9-11'],
    relation: 'part-whole',
    a: '屏幕',
    b: '手机',
    c: '键盘',
    options: ['按键', '电脑', '打字', '屏幕'],
    answerIndex: 1,
  },

  // 低龄·因果：事件→必然直接结果（打雷/寒冷=不必然的伴随现象陷阱；云=先兆方向反）
  {
    id: 'v13',
    difficulty: 3,
    ageBands: ['6-8', '9-11'],
    relation: 'cause',
    a: '着火',
    b: '冒烟',
    c: '下雨',
    options: ['打雷', '寒冷', '地湿', '云'],
    answerIndex: 2,
  },

  // 低龄·因果：缺失行为→直接结果（吃饭=与「不吃饭」同域行为陷阱；闭眼/有精神=睡觉关联陷阱）
  {
    id: 'v14',
    difficulty: 3,
    ageBands: ['6-8', '9-11'],
    relation: 'cause',
    a: '不吃饭',
    b: '肚子饿',
    c: '不睡觉',
    options: ['有精神', '吃饭', '闭眼', '没精神'],
    answerIndex: 3,
  },

  // 低龄·功能：工具→用途（扇风=与「吹风」同类动作陷阱；电池=部件陷阱；蜡烛=同类照明物陷阱）
  {
    id: 'v15',
    difficulty: 2,
    ageBands: ['6-8', '9-11'],
    relation: 'function',
    a: '电风扇',
    b: '吹风',
    c: '手电筒',
    options: ['照明', '电池', '扇风', '蜡烛'],
    answerIndex: 0,
  },

  // ===== 批 2：中等·反义 / 功能 / 因果（6 题）=====

  // 中等·反义（跑步=与前进同域动作陷阱；停止=相邻义项但非反义）
  {
    id: 'v16',
    difficulty: 4,
    ageBands: ['9-11', '12-16', 'adult'],
    relation: 'antonym',
    a: '开始',
    b: '结束',
    c: '前进',
    options: ['后退', '跑步', '方向', '停止'],
    answerIndex: 1,
  },

  // 中等·反义（阳光/电灯=明亮的来源陷阱；颜色=无关属性陷阱）
  {
    id: 'v17',
    difficulty: 4,
    ageBands: ['9-11', '12-16', 'adult'],
    relation: 'antonym',
    a: '白天',
    b: '黑夜',
    c: '明亮',
    options: ['阳光', '电灯', '黑暗', '颜色'],
    answerIndex: 2,
  },

  // 中等·反义（合作/友好=与团结同向的近义词陷阱，非反义）
  {
    id: 'v18',
    difficulty: 5,
    ageBands: ['9-11', '12-16', 'adult'],
    relation: 'antonym',
    a: '节约',
    b: '浪费',
    c: '团结',
    options: ['合作', '力量', '友好', '分裂'],
    answerIndex: 3,
  },

  // 中等·反义（容易=与简单近义的同向陷阱；注意排除「困难」避免双反义对）
  {
    id: 'v19',
    difficulty: 6,
    ageBands: ['9-11', '12-16', 'adult'],
    relation: 'antonym',
    a: '寒冷',
    b: '炎热',
    c: '简单',
    options: ['复杂', '容易', '题目', '有趣'],
    answerIndex: 0,
  },

  // 中等·功能：工具→用途（背诵=与计算同域学习行为陷阱；拼音/页数=字典内容与属性陷阱）
  {
    id: 'v20',
    difficulty: 5,
    ageBands: ['9-11', '12-16', 'adult'],
    relation: 'function',
    a: '计算器',
    b: '计算',
    c: '字典',
    options: ['背诵', '查字', '拼音', '页数'],
    answerIndex: 1,
  },

  // 中等·因果：状态/行为→结果（看书=与复习同域行为陷阱；考试=事件陷阱；忘记=反向结果陷阱）
  {
    id: 'v21',
    difficulty: 6,
    ageBands: ['9-11', '12-16', 'adult'],
    relation: 'cause',
    a: '过了保质期',
    b: '变质',
    c: '好好复习',
    options: ['看书', '考试', '考得好', '忘记'],
    answerIndex: 2,
  },

  // ===== 批 3：高阶·程度 / 抽象种属 / 因果（7 题）=====

  // 高阶·程度：情绪/行为强度递进（夸奖=反向陷阱；指出=弱于批评的方向不符陷阱）
  {
    id: 'v22',
    difficulty: 7,
    ageBands: ['12-16', 'adult'],
    relation: 'degree',
    a: '喜欢',
    b: '热爱',
    c: '批评',
    options: ['夸奖', '指出', '惩罚', '痛斥'],
    answerIndex: 3,
  },

  // 高阶·程度：幅度递进（高兴=笑背后的情绪陷阱；笑容=同义名词陷阱）
  {
    id: 'v23',
    difficulty: 7,
    ageBands: ['12-16', 'adult'],
    relation: 'degree',
    a: '凉',
    b: '冰凉',
    c: '微笑',
    options: ['大笑', '高兴', '哭泣', '笑容'],
    answerIndex: 0,
  },

  // 高阶·程度：情绪强度递进（平静=反义陷阱；意外=与惊讶近义的方向不符陷阱）
  {
    id: 'v24',
    difficulty: 8,
    ageBands: ['12-16', 'adult'],
    relation: 'degree',
    a: '不悦',
    b: '愤怒',
    c: '惊讶',
    options: ['平静', '震惊', '高兴', '意外'],
    answerIndex: 1,
  },

  // 高阶·程度：同属性量级递进（渺小=与微小近义陷阱；收缩/密度=方向或无关陷阱）
  {
    id: 'v25',
    difficulty: 8,
    ageBands: ['12-16', 'adult'],
    relation: 'degree',
    a: '温热',
    b: '滚烫',
    c: '微小',
    options: ['渺小', '收缩', '庞大', '密度'],
    answerIndex: 2,
  },

  // 高阶·抽象种属：具体/抽象个体→上位类（半径=部分反向陷阱；画圆=动作陷阱；对称=属性陷阱）
  {
    id: 'v26',
    difficulty: 8,
    ageBands: ['12-16', 'adult'],
    relation: 'category',
    a: '诗歌',
    b: '文学',
    c: '圆',
    options: ['半径', '画圆', '对称', '几何图形'],
    answerIndex: 3,
  },

  // 高阶·因果：持续条件→负面后果（早点睡觉/白天补觉=应对行为陷阱；精力充沛=反向陷阱）
  {
    id: 'v27',
    difficulty: 9,
    ageBands: ['12-16', 'adult'],
    relation: 'cause',
    a: '温度升高',
    b: '冰川融化',
    c: '长期熬夜',
    options: ['免疫力下降', '早点睡觉', '白天补觉', '精力充沛'],
    answerIndex: 0,
  },

  // 高阶·因果：长期条件→生态/生理后果（海洋污染=同类问题陷阱；渔网破损=同域事件陷阱；休渔期=应对陷阱）
  {
    id: 'v28',
    difficulty: 10,
    ageBands: ['12-16', 'adult'],
    relation: 'cause',
    a: '长期不运动',
    b: '肌肉萎缩',
    c: '过度捕捞',
    options: ['海洋污染', '鱼类减少', '渔网破损', '休渔期'],
    answerIndex: 1,
  },
];
