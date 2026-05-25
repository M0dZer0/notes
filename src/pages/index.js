import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import {useEffect, useState} from 'react';
import {motion} from 'framer-motion';
import homeStats from '@site/src/data/home-stats.json';
import styles from './index.module.css';

const stats = homeStats.stats;

const timeline = [
  {
    year: '2021.09',
    title: '上海交通大学 信息安全专业',
    subtitle: 'Shanghai Jiao Tong University, Information Security',
    accent: 'Bachelor',
  },
  {
    year: '2023.05',
    title: '第一次参加 CTF 比赛',
    subtitle: 'First time competing in a Capture the Flag event',
    accent: 'CTF',
  },
  {
    year: '2024.07',
    title: '搭建我的个人博客',
    subtitle: 'Built my personal blog',
    accent: 'Blog',
  },
  {
    year: '2025.09',
    title: '上海交通大学 网络空间安全专业',
    subtitle: 'Shanghai Jiao Tong University, Cyberspace Security',
    accent: 'Master',
  },
  {
    year: '2025.12',
    title: '腾讯科恩实验室实习生',
    subtitle: 'Tencent Keen Lab Intern',
    accent: 'Intern',
  },
  {
    year: '2026.05',
    title: '使用 Codex 重构我的主页',
    subtitle: 'Rebuilt my homepage with Codex',
    accent: 'Codex',
  },
];

const cards = [
  {
    title: '学习笔记',
    subtitle: 'Study notes',
  },
  {
    title: '编程能力',
    subtitle: 'Coding skills',
  },
  {
    title: '成长与思考',
    subtitle: 'Growth and reflection',
  },
];

function formatAnimatedValue(value, suffix = '') {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1).replace(/\.0$/, '')}k${suffix}`;
  }

  if (Number.isInteger(value)) {
    return `${value}${suffix}`;
  }

  return `${value.toFixed(1).replace(/\.0$/, '')}${suffix}`;
}

function AnimatedStatValue({rawValue, suffix}) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const durationMs = 1400;
    const start = performance.now();
    let frameId;

    const tick = (now) => {
      const progress = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(rawValue * eased);

      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, [rawValue]);

  return formatAnimatedValue(displayValue, suffix);
}

function HeroSection() {
  return (
    <section className={styles.heroSection}>
      <div className={styles.heroBackdrop} />
      <div className={clsx('container', styles.heroGrid)}>
        <motion.div
          className={styles.heroCopy}
          initial={{opacity: 0, y: 26}}
          animate={{opacity: 1, y: 0}}
          transition={{duration: 0.8, ease: 'easeOut'}}>
          <Heading as="h1" className={styles.heroTitle}>
            THINK MORE, ACHIEVE MORE.
          </Heading>
          <div className={styles.heroActions}>
            <Link className={clsx('button button--lg', styles.primaryButton)} to="/docs/intro">
              Enter Notes
            </Link>
          </div>
        </motion.div>

        <motion.div
          className={styles.heroPanel}
          initial={{opacity: 0, y: 32}}
          animate={{opacity: 1, y: 0}}
          transition={{duration: 0.85, delay: 0.08, ease: 'easeOut'}}>
          <div className={styles.panelGlow} />
          <div className={styles.panelHeader}>
            <span>Live Snapshot</span>
            <span>{homeStats.summary}</span>
          </div>
          <div className={styles.statGrid}>
            {stats.map((stat) => (
              <div key={stat.label} className={styles.statCard}>
                <span className={styles.statValue}>
                  <AnimatedStatValue rawValue={stat.rawValue} suffix={stat.suffix} />
                </span>
                <span className={styles.statLabel}>{stat.label}</span>
                <span className={styles.statDetail}>{stat.detail}</span>
              </div>
            ))}
          </div>
          <div className={styles.panelNote}>
            <span className={styles.panelDot} />
            Updated from the markdown files in this workspace.
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function HighlightsSection() {
  return (
    <section className={styles.highlightsSection}>
      <div className={clsx('container', styles.highlightsGrid)}>
        {cards.map((card, index) => (
          <motion.article
            key={card.title}
            className={styles.highlightCard}
            initial={{opacity: 0, y: 24}}
            whileInView={{opacity: 1, y: 0}}
            viewport={{once: true, amount: 0.4}}
            transition={{duration: 0.55, delay: index * 0.08, ease: 'easeOut'}}>
            <span className={styles.highlightIndex}>0{index + 1}</span>
            <Heading as="h2" className={styles.highlightTitle}>
              {card.title}
            </Heading>
            <p className={styles.highlightSubtitle}>{card.subtitle}</p>
          </motion.article>
        ))}
      </div>
    </section>
  );
}

function TimelineSection() {
  return (
    <section className={styles.timelineSection}>
      <div className={clsx('container', styles.timelineWrap)}>
        <motion.div
          className={styles.timelineIntro}
          initial={{opacity: 0, y: 20}}
          whileInView={{opacity: 1, y: 0}}
          viewport={{once: true, amount: 0.5}}
          transition={{duration: 0.6, ease: 'easeOut'}}>
          <Heading as="h2" className={styles.sectionTitle}>
            大事记
          </Heading>
          <p className={styles.sectionSubtitle}>A timeline of key milestones.</p>
        </motion.div>

        <div className={styles.timelineRail}>
          {timeline.map((item, index) => (
            <motion.article
              key={item.year}
              className={styles.timelineItem}
              initial={{opacity: 0, y: 28}}
              whileInView={{opacity: 1, y: 0}}
              viewport={{once: true, amount: 0.35}}
              transition={{duration: 0.6, delay: index * 0.08, ease: 'easeOut'}}>
              <div className={styles.timelineMarker}>
                <span className={styles.markerCore} />
              </div>
              <div className={styles.timelineContent}>
                <div className={styles.timelineTopline}>
                  <span className={styles.timelineYear}>{item.year}</span>
                  <span className={styles.timelineAccent}>{item.accent}</span>
                </div>
                <Heading as="h3" className={styles.timelineTitle}>
                  {item.title}
                </Heading>
                <p className={styles.timelineSubtitle}>{item.subtitle}</p>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const {siteConfig} = useDocusaurusContext();

  return (
    <Layout
      title={siteConfig.title}
      description="A cinematic homepage with a theme-aware timeline and a more expressive personal presence.">
      <main className={styles.homepage}>
        <HeroSection />
        <HighlightsSection />
        <TimelineSection />
      </main>
    </Layout>
  );
}
