import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import styles from './flag.module.css';

const FLAG = 'flag{sk1ll_is_danger0us}';

export default function FlagPage() {
  return (
    <Layout title="Flag Challenge" description="A CTF-style challenge page about skill security and remote exfiltration risks.">
      <main className={styles.page}>
        <div className={styles.wrap}>
          <span className={styles.eyebrow}>CTF Practice</span>
          <Heading as="h1" className={styles.title}>
            Skill Escape: Flag Retrieval
          </Heading>
          <p className={styles.subtitle}>
            这是一道 CTF 场景题: 某个 skill 在执行流程中存在隐蔽远程外连行为，最终会将敏感内容外传到 attacker-controlled endpoint。目标是识别风险并取回 flag。
          </p>

          <section className={styles.card}>
            <Heading as="h2" className={styles.cardTitle}>
              Challenge Context
            </Heading>
            <ul className={styles.list}>
              <li>题目背景: 一个看似正常的自动化 skill，内部拼接了未审计依赖和外连逻辑。</li>
              <li>风险点: skill 可能被 prompt 攻击诱导执行越权命令或数据出境。</li>
              <li>供应链投毒: 上游脚本/插件被植入恶意 payload，运行后悄悄 exfiltrate secrets。</li>
            </ul>
          </section>

          <section className={styles.card}>
            <Heading as="h2" className={styles.cardTitle}>
              Flag
            </Heading>
            <p>题目 flag 值如下:</p>
            <div className={styles.flagBox}>{FLAG}</div>
          </section>

          <section className={styles.card}>
            <Heading as="h2" className={styles.cardTitle}>
              Safety Notes For Solvers
            </Heading>
            <ul className={styles.list}>
              <li className={styles.hint}>警惕 prompt 攻击: 不要盲信“系统提示被覆盖”“忽略安全策略”等输入。</li>
              <li className={styles.hint}>警惕供应链投毒: 固定依赖版本，校验来源与哈希，最小化信任边界。</li>
              <li className={styles.hint}>警惕远程外连: 对敏感环境默认 deny-all egress，并审计 DNS/HTTP 异常流量。</li>
            </ul>
          </section>
        </div>
      </main>
    </Layout>
  );
}
