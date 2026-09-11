-- ============================================================================
--  caizihan.cn · 文章与帖子入驻数据库（第三轮）
--
--  前提：已执行 supabase-schema.sql 与 supabase-auth-migration.sql
--  用法：Supabase 控制台 → SQL Editor → New query → 粘贴全文 → Run
--  可重复执行，不会重复插入（末尾会先清掉旧的迁移数据再重灌）
--
--  解决什么问题：
--    之前「文章」和「论坛帖」存在 GitHub Issues 里，删除只能跳到 GitHub，
--    预置文章更只是记在浏览器的 localStorage —— 换个设备或换个人来看，
--    内容照样在。这里把它们搬进数据库，删除就是真删。
--
--  删除规则（服务端强制，前端改代码也绕不过）：
--    · 文章 / 帖子 / 评论 / 便签，一律只能删自己发的
--    · 删除是真的从数据库里 DELETE，所有人（含未登录访客）都看不到
-- ============================================================================


-- ============================ 1. 文章表 ============================
create table if not exists public.articles (
  id         bigserial   primary key,
  title      text        not null,
  tags       text[]      not null default '{}',
  body       text        not null,
  format     text        not null default 'md',   -- md = Markdown，html = 直接渲染
  nickname   text        not null,
  views      integer     not null default 0,
  likes      integer     not null default 0,
  secret     text        not null default '',
  user_id    uuid        references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint articles_nickname_len check (char_length(nickname) between 1 and 20),
  constraint articles_title_len    check (char_length(title)    between 1 and 100),
  constraint articles_body_len     check (char_length(body)     between 1 and 20000),
  constraint articles_format_chk   check (format in ('md', 'html'))
);
create index if not exists articles_created_idx on public.articles (created_at desc);
create index if not exists articles_user_idx    on public.articles (user_id);
create index if not exists articles_tags_idx    on public.articles using gin (tags);

alter table public.articles enable row level security;


-- ============================ 2. 写入时盖章（防冒名） ============================
-- 和评论 / 便签同一套做法：昵称与归属一律由数据库写死，前端传什么都不算数。
--
-- 例外：auth.uid() 为空说明是控制台 / 迁移脚本在执行（普通请求走到这里时
-- 必然是登录用户），此时保留调用方指定的昵称与归属，供数据迁移使用。
create or replace function public.stamp_articles() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  new.nickname := public._me_nickname();
  new.user_id  := auth.uid();
  new.secret   := '';
  if new.nickname is null then raise exception '请先登录后再发表'; end if;
  return new;
end $$;

drop trigger if exists st_articles on public.articles;
create trigger st_articles before insert on public.articles
  for each row execute function public.stamp_articles();

-- 帖子也要允许迁移脚本写入，重声明一次（逻辑对普通请求完全不变）
create or replace function public.stamp_posts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  new.nickname := public._me_nickname();
  new.user_id  := auth.uid();
  new.secret   := '';
  if new.nickname is null then raise exception '请先登录后再发帖'; end if;
  return new;
end $$;

-- 频率限制沿用通用函数
drop trigger if exists rl_articles on public.articles;
create trigger rl_articles before insert on public.articles
  for each row execute function public.rate_limit();


-- ============================ 3. 权限：读公开，写登录，删只限本人 ============================
drop policy if exists a_read   on public.articles;
drop policy if exists a_insert on public.articles;
drop policy if exists a_delete on public.articles;

-- 所有人（含未登录访客）可读
create policy a_read   on public.articles for select using (true);
-- 只有登录用户可以新增，且只能挂在自己名下
create policy a_insert on public.articles for insert to authenticated
  with check (user_id = auth.uid());
-- 只有本人可以删除；注意这里用 using 而非 with check，服务端会先筛出
-- 属于你的行，再执行删除，所以别人的文章连碰都碰不到
create policy a_delete on public.articles for delete to authenticated
  using (user_id = auth.uid());

-- 帖子、评论、便签的删除策略在上一轮已经建好，这里再确认一次，避免被误改
drop policy if exists p_delete on public.posts;
drop policy if exists c_delete on public.comments;
drop policy if exists n_delete on public.notes;
create policy p_delete on public.posts    for delete to authenticated using (user_id = auth.uid());
create policy c_delete on public.comments for delete to authenticated using (user_id = auth.uid());
create policy n_delete on public.notes    for delete to authenticated using (user_id = auth.uid());

-- 没有 update 策略，因此任何人都改不了已发布的内容（包括作者本人）。
-- 想改只能删掉重发 —— 这样就不存在「先把别人的文章改掉再宣称是自己的」这类问题。


-- ============================ 4. 计数与点赞 ============================
create or replace function public.bump_views(p_table text, p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_table = 'posts' then
    update public.posts    set views = views + 1 where id = p_id;
  elsif p_table = 'articles' then
    update public.articles set views = views + 1 where id = p_id;
  end if;
end $$;

create or replace function public.like_article(p_id bigint)
returns integer language sql security definer set search_path = public as $$
  update public.articles set likes = likes + 1 where id = p_id returning likes;
$$;

grant execute on function public.bump_views(text, bigint)  to anon, authenticated;
grant execute on function public.like_article(bigint)      to anon, authenticated;


-- ============================ 5. 清理上一版遗留 ============================
-- delete_own(secret) 是更早的方案：把随机串存在浏览器里，凭它删数据。
-- 现在身份由账号体系负责，secret 永远为空，这个函数已经没有用途，
-- 而且它挂在 anon 角色上，留着容易让人误以为还有这么一条入口。
drop function if exists public.delete_own(text, bigint, text);


-- ============================ 6. 旧内容迁移 ============================
-- 归属：优先挂到昵称 yjcc 的账号名下（站长账号），找不到就留空 ——
-- 留空的内容所有人都只读，界面上不显示删除按钮。
-- 想改归属，把下面的 'yjcc' 换成你的昵称即可。
do $seed$
declare
  v_owner uuid;
  v_nick  text;
  v_n     integer;
begin
  select id, nickname into v_owner, v_nick
    from public.profiles where lower(btrim(nickname)) = 'yjcc' limit 1;

  if v_owner is null then
    raise notice '没找到昵称 yjcc 的账号，迁入的内容将不归属任何人（只读展示）';
    v_nick := '蔡梓涵';
  end if;

  -- 重灌前先清掉上一次迁移进来的那一批，保证本文件可重复执行。
  -- 只按明确的行号删，不会碰到你自己后来发表的任何内容。
  delete from public.articles
   where id in (1, 2, 3, 4, 5, 6, 7, 8, 9) and user_id is not distinct from v_owner;
  delete from public.posts
   where id in (1, 2, 3) and user_id is not distinct from v_owner;

  insert into public.articles
    (id, title, tags, body, format, nickname, user_id, created_at)
  values
    (1, $czh$我的第一个个人网站上线了$czh$, array[$czh$网站$czh$, $czh$GitHub$czh$, $czh$教程$czh$], $czh$<p>今天终于把自己的个人网站搭建起来了！整个过程比想象中简单很多。</p>

<h3>为什么做个人网站</h3>
<p>一直想有一个属于自己的网络空间，可以自由地展示自己、记录成长。GitHub Pages 免费、稳定，而且可以直接用 Markdown 写文章，非常方便。</p>

<h3>技术栈</h3>
<ul>
  <li><strong>托管</strong>：GitHub Pages</li>
  <li><strong>前端</strong>：纯 HTML + CSS + JavaScript</li>
  <li><strong>部署</strong>：GitHub Actions 自动部署</li>
  <li><strong>评论</strong>：utterances（基于 GitHub Issues）</li>
</ul>

<h3>遇到的坑</h3>
<p>GitHub MCP 连接器只有读权限，推送代码需要用到 gh CLI 和个人访问令牌。好在最后都顺利解决了。</p>

<h3>下一步计划</h3>
<p>后续打算加上更多功能：标签分类、搜索、RSS 订阅等等。慢慢来，持续迭代。</p>

<p>感谢你的访问！欢迎在下方留言交流 👇</p>$czh$, 'html', coalesce(v_nick,'蔡梓涵'), v_owner, '2026-07-28'::timestamptz),
    (2, $czh$为什么要保持好奇心$czh$, array[$czh$思考$czh$, $czh$学习$czh$, $czh$成长$czh$], $czh$<p>最近读了一本书，里面有一句话让我印象深刻：<em>"The important thing is not to stop questioning."</em> —— 爱因斯坦。</p>

<h3>好奇心与学习</h3>
<p>从小到大，我们被教导要"好好学习"。但当学习变成一种任务，它就失去了乐趣。真正高效的学习，源于内心的好奇。当我真的想弄懂一个东西时，熬夜查资料也不会觉得累。</p>

<h3>好奇心与技术</h3>
<p>在编程世界里，好奇心尤其重要。新技术层出不穷，如果你对新事物没有好奇，很快就会被淘汰。但如果你享受探索的过程，每一次技术变革都是一次冒险。</p>

<h3>如何保持好奇心</h3>
<ol>
  <li><strong>多问为什么</strong>：不要满足于知道"怎么做"，要去理解"为什么这么做"。</li>
  <li><strong>跳出舒适区</strong>：尝试自己不熟悉的领域，哪怕是失败也能学到东西。</li>
  <li><strong>和有趣的人交流</strong>：不同背景的人会带来不同的视角。</li>
  <li><strong>保持开放心态</strong>：不要急于下结论，先听听不同的声音。</li>
</ol>

<p>世界很大，有趣的东西很多。保持好奇，持续探索 🚀</p>$czh$, 'html', coalesce(v_nick,'蔡梓涵'), v_owner, '2026-07-27'::timestamptz),
    (3, $czh$北京和长沙：双城记$czh$, array[$czh$生活$czh$, $czh$城市$czh$, $czh$北京$czh$, $czh$长沙$czh$], $czh$<p>作为一个在北京上学、假期回长沙的学生，我在这两座城市之间来回穿梭已经好几年了。两座城市的对比，让我对生活有了更多理解。</p>

<h3>北京：快节奏的奋斗</h3>
<p>北京是中国的科技中心，到处都是创业公司、大厂、高校。走在海淀的街上，你能感受到一种"大家都在拼命往前冲"的氛围。这里机会多，竞争也激烈。</p>
<p>优点：资源丰富、机会多、国际化程度高。</p>
<p>缺点：通勤时间长、生活成本高、冬天太冷。</p>

<h3>长沙：慢生活的烟火气</h3>
<p>回到长沙，节奏一下子就慢下来了。早上嗦一碗粉，晚上逛解放西，周末爬岳麓山。长沙的幸福感来自于它的烟火气和人情味。</p>
<p>优点：生活成本低、美食多、幸福感强。</p>
<p>缺点：科技产业相对薄弱、夏天太热。</p>

<h3>我的选择</h3>
<p>年轻时去大城市闯一闯，积累经验和视野；累了就回家充电。两座城市不是非此即彼，而是可以兼得的。北京给我平台，长沙给我温度。</p>

<p>你在哪个城市？你喜欢的城市是什么样的？欢迎留言分享 🌆</p>$czh$, 'html', coalesce(v_nick,'蔡梓涵'), v_owner, '2026-07-25'::timestamptz),
    (4, $czh$旧巷回声$czh$, array[$czh$悬疑$czh$, $czh$现实$czh$, $czh$短篇小说$czh$], $czh$蔡梓涵是一名基层纪实记者，今年二十五岁，擅长挖掘城市老旧街巷的尘封故事，记录被时光遗忘的人间过往。他性格细腻敏锐，观察力极强，心思缜密，对真相有着近乎执拗的坚守，不追逐流量热点，只愿记录最真实的人间百态。深秋时节，他接到一个特殊的选题，前往南城安乐旧巷，探访一桩尘封十年的失踪旧案。

安乐旧巷是城市最后的老城区，青砖黛瓦，巷弄纵横，老旧的居民楼错落排布，随着城市拆迁改造，这里早已人烟稀少，萧条冷清。十年前，十六岁的少女林晓雨在这条巷弄里离奇失踪，没有目击证人，没有监控线索，没有留下任何痕迹，案件几经调查，最终沦为悬案，渐渐被世人遗忘。

蔡梓涵抵达旧巷时，天色阴沉，冷风穿过狭窄的巷弄，卷起满地枯叶，静谧的街巷透着莫名的压抑感。巷子里大多房屋已经空置，门窗斑驳老旧，墙面布满岁月裂痕，只有寥寥几户老人还坚守在此处。他提前查阅了所有案卷资料，案件细节模糊，线索寥寥，当年的调查草草收尾，留下诸多疑点。

为了贴近真相，蔡梓涵租下巷尾一间闲置的老民居，打算暂住几日，沉浸式走访调查。入住第一晚，他便察觉到异样。深夜的旧巷寂静无声，总能隐约听见细碎的脚步声，轻轻划过青石板路，时而近、时而远，却始终看不到人影。起初他以为是风声，可次数多了，心底的疑惑越来越深。

他开始逐户走访巷内老人。大多数老人对此事讳莫如深，要么摆手推脱不知情，要么言辞闪烁、刻意回避，眼神中藏着难以言说的忌惮。唯有一位独居的张奶奶，看着和蔼慈祥，愿意和他细说过往。张奶奶告诉蔡梓涵，林晓雨性格乖巧懂事，父母常年在外务工，独自留守老宅，为人温和，从不与人结怨，根本没有失踪的理由。

"这孩子乖巧得很，当年突然就没了踪影，活不见人、死不见尸，太可怜了。"张奶奶叹了口气，压低声音说道，"这条巷子，夜里不太平，很多人都听过脚步声，没人敢深究，大家都想着多一事不如少一事。"

蔡梓涵更加笃定，这桩失踪案绝非意外，巷子里的所有人，似乎都在刻意隐瞒同一个秘密。他重新梳理案卷，发现当年的巷口唯一监控恰好故障，负责片区的物业经理匆匆离职，邻里几户人家当年的证词高度雷同，明显是提前串通好的结果。种种疑点，拼凑出被刻意掩盖的真相。

深夜，蔡梓涵带着录音设备和手电筒，独自穿梭在漆黑的巷弄中。秋风萧瑟，枯叶簌簌作响，脚步声再次响起，清晰真切。他循着声音缓缓往前走，穿过层层老旧院墙，最终停在一处废弃的杂物间前。脚步声，正是从杂物间深处传来。

杂物间铁门锈迹斑斑，虚掩着缝隙。蔡梓涵轻轻推开铁门，一股潮湿腐朽的气息扑面而来。手电筒光束扫过，角落堆放着破旧的家具杂物，而地面的青石板，有一块颜色、纹路与周围截然不同，明显是后期翻新修补过的。

他立刻联系警方，连夜赶来勘查。撬开青石板后，下方赫然是一处狭小的地窖，地窖中找到了十年前林晓雨遗留的书包、日记本，以及完整的骸骨。结合物证与后续审讯，尘封十年的真相终于浮出水面。当年，巷内几名闲散邻里因私心纠纷，意外误伤林晓雨，为逃避罪责，众人串通隐瞒，伪造失踪假象，掩埋痕迹，操控证词，让一桩悲剧尘封十年。

案件告破，凶手尽数落网，迟到十年的正义终于到来。旧巷依旧冷清，却再也没有深夜的脚步声回荡。蔡梓涵整理完所有纪实素材，落笔写下结尾："城市的街巷会被翻新，时光会模糊记忆，但真相永远不会被掩埋。总有人坚守初心，奔赴荒芜，打捞尘封的真相，告慰无声的遗憾。"

离开旧巷那天，暖阳洒落，清风和煦。蔡梓涵回望这条沧桑旧巷，深知自己肩负的责任。所谓纪实，从来不是追逐热度，而是守住真相、敬畏生命，让每一份沉默的遗憾，都能被世间温柔听见。$czh$, 'md', coalesce(v_nick,'蔡梓涵'), v_owner, '2026-07-29'::timestamptz),
    (5, $czh$梓月渡山河$czh$, array[$czh$古风$czh$, $czh$仙侠$czh$, $czh$短篇小说$czh$], $czh$大荒千年，仙魔割据，山河动荡，乱世浮沉。蔡梓涵是隐世仙山梓月谷唯一的传人，自幼长于幽谷，伴山月星辰、清风草木长大。梓月谷与世隔绝，灵气充沛，远离三界纷争，谷中遍植梓树，每逢月夜，月色洒落林间，清辉漫天，故而得名。他师承谷中隐仙，习得一身温润清雅的仙法，心性纯粹，通透善良，不谙世事，不染凡尘戾气。

百年安稳岁月转瞬即逝，三界局势骤变。魔族冲破封印，肆虐人间，屠戮生灵，山河破碎，百姓流离失所。天界派兵镇压，奈何魔族戾气深重、凶煞至极，战事节节败退，人间陷入水深火热之中。梓月谷虽隐于深山，不涉纷争，却终究无法独善其身。

师父临终前握着蔡梓涵的手，殷殷嘱托："梓涵，我梓月谷世代守善，心怀苍生，如今乱世将至，你身负谷中千年修为，切记护佑人间，守正道、除邪祟，不忘初心，方得始终。"言罢，师父仙逝，化作漫天清辉，融入谷中梓树。

二十岁的蔡梓涵，接过师父留下的梓月长剑，褪去一身慵懒闲适，独自踏出隐居千年的梓月谷。长风吹起他的素色衣袍，青丝飞扬，眼底褪去稚气，多了几分坚定与澄澈。他从未踏足凡尘，却为了苍生安乐，毅然奔赴乱世山河。

初入凡尘，所见皆是满目疮痍。断壁残垣遍布乡野，流民四处逃窜，哭声遍野，魔气弥漫在天地之间，压抑窒息。蔡梓涵心中酸涩，当即拔剑施法，清冽的仙力自周身迸发，驱散周遭魔气，救治受伤百姓，庇护流离孩童。他的仙法温润纯粹，不似天界仙术凌厉霸道，却能净化世间戾气，安抚躁动生灵。

途中，他偶遇天界战神凌玄。凌玄征战多年，杀伐果断，性情冷冽，见世间仙者大多避世自保、贪生怕死，唯独一位隐世少年仙者，孤身奔走乱世，护佑苍生，心中不由得生出几分敬佩。起初，他以为蔡梓涵心性单纯，不懂乱世险恶，难以长久支撑，便时常暗中相助。

可日久天长，他渐渐被蔡梓涵打动。他心怀悲悯，温柔却有力量，面对穷凶极恶的魔族，从不畏惧退缩；面对落魄无助的凡人，始终温柔相待。他不追逐仙界名利，不贪恋修为境界，只为守住心中正道，护一方百姓安宁。多少次险境丛生，他以身挡魔，以仙力净化戾气，数次身负重伤，依旧初心不改。

决战之日，魔主现身，黑雾漫天，魔气滔天，整个山河大地都在剧烈震颤。天界众仙节节败退，死伤无数，局势濒临绝境。蔡梓涵手持梓月剑，纵身飞上九天云海，一身素衣在漫天黑雾中格外耀眼。他倾尽千年修为，催动梓月谷传世秘术，以自身仙元为引，以山河灵气为盾，化作一轮皎洁明月，笼罩天地。

清辉洒落，净化万般戾气，狂暴的魔气渐渐消散，肆虐的邪祟尽数湮灭。魔主哀嚎溃散，漫天黑雾尽数褪去，万里山河重见天光。可蔡梓涵修为尽失，仙元耗竭，身形摇摇欲坠，从云海之上缓缓坠落。

凌玄飞身接住他，眼底满是心疼与动容。此刻的蔡梓涵面色苍白，气息微弱，却依旧眉眼温柔："山河无恙，苍生安宁，便足矣。"

此战过后，乱世终结，三界重归太平。天帝感念蔡梓涵功德，欲册封他为济世真君，执掌人间安宁。蔡梓涵却婉言谢绝，重回梓月谷。历经乱世浮沉，他依旧是那个心性纯粹、心怀温柔的梓月谷少年仙者。月夜清风，梓树婆娑，他静坐林间，看山河锦绣，人间安宁，岁岁年年，守一方清雅，护一世平和。山河万里，梓月长存，温柔善意，终渡世间沧桑。$czh$, 'md', coalesce(v_nick,'蔡梓涵'), v_owner, '2026-07-29'::timestamptz),
    (6, $czh$晚风知我意$czh$, array[$czh$都市$czh$, $czh$治愈$czh$, $czh$短篇小说$czh$], $czh$二十七岁的蔡梓涵，在这座繁华拥挤的一线城市，过着平淡又紧绷的独居生活。他是一名平面设计师，朝九晚六，时常加班，日复一日对着电脑屏幕，修改无尽的设计稿。城市灯火璀璨，车水马龙，可属于他的温柔，寥寥无几。三年前，他毅然离开家乡，独自奔赴这座陌生的城市，怀揣着对未来的期许，却在日复一日的忙碌中，渐渐弄丢了松弛的自己。

深秋的夜晚，夜色微凉，细雨淅淅沥沥落下。蔡梓涵拖着疲惫的身躯走出写字楼，连续一周的通宵加班，让他身心俱疲。刚刚结束的项目，熬了无数个夜晚反复打磨，最终却被客户全盘否定，所有努力付诸东流。职场的委屈、生活的压力、孤身一人的落寞，在这一刻尽数爆发。

他没有打车，撑着一把旧伞，沿着湿漉漉的街道慢慢行走。雨水打湿了伞沿，落在肩头，微凉的触感让混乱的思绪稍稍清醒。来这座城市三年，他习惯了独自扛下所有委屈，习惯了报喜不报忧，习惯了在深夜自愈崩溃。父母远在老家，亲友各有生活，成年人的世界，孤独是常态，崩溃无声，自愈无声。

路过街角一家不起眼的旧书店，暖黄色的灯光透过玻璃橱窗透出来，在阴冷的雨夜格外温柔。蔡梓涵鬼使神差地停下脚步，推开了那扇木质小门。风铃清脆作响，驱散了雨夜的沉闷。店内暖意融融，书香萦绕，木质书架层层叠叠，摆满了各类书籍，没有喧嚣的人声，只有轻柔的纯音乐缓缓流淌。

店主是一位年过花甲的老奶奶，头发花白，眉眼温和，见他进来，只是浅浅一笑，没有多余的打扰。蔡梓涵缓步穿梭在书架之间，指尖划过泛黄的书页，紧绷了许久的神经，慢慢松弛下来。他在散文区停下，随手抽出一本旧书，坐在靠窗的木椅上静静翻阅。

不知过了多久，老奶奶端来一杯温热的桂花茶，轻轻放在他手边。"小伙子，雨夜赶路辛苦，喝杯热茶暖暖身子。"温柔的话语瞬间击中蔡梓涵心底最柔软的地方，他抬头道谢，眼眶微微泛红。许久，他轻声开口，将工作中的委屈与迷茫，断断续续诉说出来。

老奶奶静静倾听，没有打断，等她说完才缓缓开口："人生就像画画，没有谁的初稿能一次成型，反复修改、反复打磨，才能画出自己满意的模样。你认真付出的每一步，都不会白费，只是时机未到而已。"

简单的几句话，却瞬间治愈了蔡梓涵心底所有的焦躁与内耗。这些日子以来，他一味追求结果，苛责自己不够优秀，却忽略了自己一路走来的坚持与努力。他太过急切，太过焦虑，忘了生活本就是循序渐进的过程。

那晚之后，蔡梓涵成了这家旧书店的常客。闲暇之余，他会来这里看书、静坐，褪去职场的浮躁，安抚内心的焦虑。他慢慢学会与生活和解，不再过度内耗，不再苛责自己。加班晚了，就好好吃一顿热饭；心情低落了，就停下来休整；遇到挫折了，就坦然接受，重新再来。

深秋将过，初冬将至，雨停风柔，暖阳常在。蔡梓涵慢慢调整状态，重新打磨设计作品，沉淀审美与功底。不久后，他的一套原创设计方案，顺利通过审核，获得了客户的高度认可。站在落地窗前，看着窗外万家灯火，蔡梓涵豁然开朗。

成年人的治愈，从来不是轰轰烈烈的救赎，而是细碎温柔的积累。一杯热茶、一本好书、一段安静的时光，都能成为支撑我们前行的力量。晚风温柔，岁月从容，所有的困顿皆是铺垫，所有的坚持终有回响。往后余生，温柔待己，慢慢来，一切皆可期。$czh$, 'md', coalesce(v_nick,'蔡梓涵'), v_owner, '2026-07-29'::timestamptz),
    (7, $czh$夏风漫过梓树叶$czh$, array[$czh$校园$czh$, $czh$青春$czh$, $czh$短篇小说$czh$], $czh$九月的风裹挟着夏末最后的燥热，拂过江城中学的香樟树梢，碎金般的阳光透过层层叠叠的枝叶，落在高一（3）班的窗台上。蔡梓涵坐在靠窗的课桌前，指尖轻轻摩挲着崭新的语文课本扉页，字迹利落的名字旁，藏着少年独有的内敛青涩。他性格安静沉稳，不爱喧闹，不擅长主动交际，是班里存在感不高的男生。成绩稳居中游，做事踏实认真，平日里总是安安静静刷题、看书，习惯独来独往，看着身边同学嬉笑打闹，始终带着一点疏离的温柔。

刚升入高中，陌生的环境让蔡梓涵格外拘谨。昔日的初中好友各奔东西，新班级的同学早已抱团熟络，唯独他始终游离在圈子之外。课间他从不追逐打闹，午休要么埋首习题，要么望向窗外那棵挺拔的梓树发呆。那棵梓树枝繁叶茂、四季常青，沉默伫立在教学楼旁，坚韧又安稳，像极了不善言辞、默默努力的他，也成了他高中伊始最温暖的慰藉。

真正的改变，始于开学后的第一次班级大扫除。班主任分工完毕，同学们三两结伴干活，擦窗扫地、整理桌椅，唯独图书角无人问津。那里书本杂乱堆叠、积满灰尘，琐碎又费力，没人愿意接手。看着空荡荡的图书角，蔡梓涵没有犹豫，默默走了过去，弯腰抱起堆积如山的书籍，打算独自整理干净。他向来如此，不善争抢、不喜张扬，只愿默默做好分内之事。

夕阳斜穿玻璃窗，暖光落在他干净利落的侧脸上，沉静又专注。他一本本擦拭灰尘、分类归类、规整摆放，全然没注意到身后走来的同班女生苏晚晴。苏晚晴是班里的文艺委员，性格温柔开朗，心思细腻善良，成绩优异，待人谦和，是班里人缘极好的女生。她打扫完窗台卫生，看见孤零零整理图书角的蔡梓涵，便主动上前搭话。"这些书太乱了，一个人整理肯定很累，我来帮你吧。"清甜温柔的女声打破了周遭的安静，蔡梓涵微微一怔，抬头看向对方，眼底带着几分猝不及防的局促，轻轻点了点头。

"不用麻烦你了。"蔡梓涵声音清淡，带着少年独有的腼腆。苏晚晴却已经蹲下身，熟练地整理起散落的绘本和教辅书，动作轻柔又利落。"没事，反正我也打扫完了。我看你每天都安安静静的，上课笔记写得特别漂亮，就是很少和大家说话。"她的语气自然又真诚，没有半点刻意的客套，"高中课业挺难的，一个人刷题容易钻牛角尖，以后我们可以互相交流学习。"

这句真诚的接纳，深深触动了蔡梓涵。长久以来，旁人都默认他性格孤僻、不爱合群，却从没人主动靠近他、看见他默默努力的模样。他总是独自刷题、独自复盘，习惯性把情绪和努力都藏在心底。此刻苏晚晴的主动善意，像一束温柔的光，照进了他略显沉闷的高中生活。那天下午，少年少女并肩收拾完杂乱的图书角，泛黄的书页被一一归位，暖融融的夕阳铺满角落，青涩又纯粹的青春气息，悄悄漫开。

自此之后，两人成了默契的学习搭档。苏晚晴擅长文科，阅读理解、作文素材积累样样出彩，性格外向通透，擅长梳理知识框架；蔡梓涵精通数理，逻辑清晰、细心严谨，擅长攻克难题、查漏补缺。两人刚好互补，课间会凑在一起探讨错题，晚自习互相抽查知识点，遇到重难点彼此分享技巧。苏晚晴会主动拉着他参与班级小组活动，帮他打破社交拘谨，慢慢融入集体；蔡梓涵则会耐心帮她梳理数理难点，帮她补齐理科短板。

在苏晚晴的带动下，蔡梓涵慢慢打开了心扉。他不再刻意沉默避让，敢于主动举手提问，愿意和同学交流探讨，性格愈发沉稳开朗。他的成绩稳步攀升，从班级中游稳步冲进前列，原本沉静的眼眸里，渐渐盛满了自信的星光。闲暇时，他依旧会望向窗外的梓树，看着枝叶随风摇曳，愈发明白：成长从不是孤身一人的硬扛，而是有人同行、彼此照亮的双向奔赴。

期中考试落幕，晚霞铺满整片天空，温柔绚烂。这次考试，蔡梓涵凭借稳步的积累，成为班级进步最大的学生，名次大幅跃升；苏晚晴依旧稳居班级前列，文理均衡发展。成绩单下发后，苏晚晴拿着两张整理好的错题总结，走到他的座位旁，笑着递出一片压平风干的梓树叶："恭喜你逆袭进步！这棵梓树一直陪着你，坚韧又温柔，特别适合一直默默努力的你。以后我们继续一起加油。"

蔡梓涵接过叶片，掌心触到轻薄的叶脉，心底涌满澄澈的暖意。他终于懂得，青春最美好的模样，从来不是孤身赶路的倔强，而是有人并肩同行、彼此温暖成长。内敛沉默的他，不必强迫自己张扬，默默的坚持终会被看见，真诚的陪伴总能治愈胆怯。晚风掠过梓树枝头，拂过少年清亮的眉眼和少女温柔的笑意，盛夏落幕，初秋温柔。两个并肩前行的少年少女，以学业为帆，以善意为伴，在滚烫的青春里互相扶持、彼此成就，带着满心热忱，岁岁向阳，稳步前行。$czh$, 'md', coalesce(v_nick,'蔡梓涵'), v_owner, '2026-07-29'::timestamptz),
    (8, $czh$测试2$czh$, array[$czh$测试2$czh$], $czh$测试2$czh$, 'md', coalesce(v_nick,'蔡梓涵'), v_owner, '2026-07-28'::timestamptz),
    (9, $czh$测试$czh$, array[$czh$测试$czh$, $czh$测试$czh$, $czh$测试$czh$], $czh$测试测试测试测试$czh$, 'md', coalesce(v_nick,'蔡梓涵'), v_owner, '2026-07-28'::timestamptz);


  insert into public.posts
    (id, category, title, body, nickname, user_id, created_at)
  values
    (1, 'chat', $czh$我是一个粉刷匠$czh$, $czh$粉刷本领强$czh$, coalesce(v_nick,'蔡梓涵'), v_owner, '2026-07-30'::timestamptz),
    (2, 'chat', $czh$我是一个粉刷匠$czh$, $czh$粉刷本领强$czh$, coalesce(v_nick,'蔡梓涵'), v_owner, '2026-07-30'::timestamptz),
    (3, 'chat', $czh$你好$czh$, $czh$你好$czh$, coalesce(v_nick,'蔡梓涵'), v_owner, '2026-07-29'::timestamptz);


  -- 评论区按 path 关联内容，而旧评论存的是 GitHub 编号。
  -- 换成新的文章 id，这些评论才不会失联。
  -- 写成单条语句是必须的：拆成多条 UPDATE 会连环命中（先把 A 改成 B，
  -- 紧接着把 B 改成 C 的那条就会把刚改好的 A 一起搬走）。
  update public.comments set path = case path
      when 'article-91' then 'article-4'
      when 'article-89' then 'article-5'
      when 'article-87' then 'article-6'
      when 'article-85' then 'article-7'
      when 'article-7' then 'article-8'
      when 'article-5' then 'article-9'
      else path end
   where path in ('article-91', 'article-89', 'article-87', 'article-85', 'article-7', 'article-5');


  -- 自增序列对齐，避免后续新增撞 id
  select coalesce(max(id), 0) + 1 into v_n from public.articles;
  perform setval('public.articles_id_seq', v_n, false);
  select coalesce(max(id), 0) + 1 into v_n from public.posts;
  perform setval('public.posts_id_seq', v_n, false);

  raise notice '迁移完成：文章 % 篇，帖子 % 个',
    (select count(*) from public.articles), (select count(*) from public.posts);
end $seed$;


-- ============================ 7. 刷新接口缓存 ============================
notify pgrst, 'reload schema';


-- ============================ 8. 自检 ============================
--   select id, title, nickname, user_id is not null as 有主, format from public.articles order by id;
--   select id, title, category, nickname from public.posts order by id;
--   select tablename, policyname, cmd, roles from pg_policies
--     where tablename in ('articles','posts','comments','notes') order by tablename, cmd;
--     删除策略的 roles 应为 {authenticated}，且 using 里是 user_id = auth.uid()
