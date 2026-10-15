/*
Copyright The CryptOS Authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

export type SplitHeroCta = {
  label: string;
  to: string;
};

export type SplitHeroTerminalLine = {
  // A line the "user" typed; rendered after a prompt and highlighted as input.
  prompt?: string;
  // Output text for a line with no prompt.
  text?: string;
};

export type SplitHeroProps = {
  eyebrow: string;
  /** The headline's first line, in the body colour. */
  headline: string;
  /** The headline's second line, rendered in the accent colour. */
  headlineAccent: string;
  /** The lede. Wrap key terms in <mark> so they pick up the hero's highlight style. */
  lede: ReactNode;
  primaryCta: SplitHeroCta;
  secondaryCta: SplitHeroCta;
  terminalTitle: string;
  terminalLines: SplitHeroTerminalLine[];
};

/**
 * A reusable split hero: an eyebrow label, a two-line headline with the
 * second line in the accent colour, a lede, two calls to action, and a
 * terminal-style card on the right over a faint grid backdrop with a
 * blurred glow in the top right corner. Shared by every CryptOS site so
 * they read as one product family.
 */
export function SplitHero({
  eyebrow,
  headline,
  headlineAccent,
  lede,
  primaryCta,
  secondaryCta,
  terminalTitle,
  terminalLines,
}: SplitHeroProps): ReactNode {
  return (
    <section className={styles.hero}>
      <div className={styles.backdrop} aria-hidden="true">
        <div className={styles.grid} />
        <div className={styles.glow} />
      </div>
      <div className={styles.inner}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 className={styles.headline}>
            {headline}
            <br />
            <span className={styles.headlineAccent}>{headlineAccent}</span>
          </h1>
          <p className={styles.lede}>{lede}</p>
          <div className={styles.actions}>
            <Link className="button button--primary button--lg" to={primaryCta.to}>
              {primaryCta.label}
            </Link>
            <Link className="button button--secondary button--lg" to={secondaryCta.to}>
              {secondaryCta.label}
            </Link>
          </div>
        </div>
        <div className={styles.terminal} role="img" aria-label={`${terminalTitle}: example output`}>
          <div className={styles.terminalChrome}>
            <span className={styles.terminalDot} />
            <span className={styles.terminalDot} />
            <span className={styles.terminalDot} />
            <span className={styles.terminalTitle}>{terminalTitle}</span>
          </div>
          <pre className={styles.terminalBody}>
            {terminalLines.map((line, idx) => (
              <div key={idx} className={styles.terminalLine}>
                {line.prompt !== undefined ? (
                  <>
                    <span className={styles.terminalPrompt}>$</span> {line.prompt}
                  </>
                ) : (
                  <span className={styles.terminalOutput}>{line.text}</span>
                )}
              </div>
            ))}
            <span className={styles.terminalCursor} aria-hidden="true" />
          </pre>
        </div>
      </div>
    </section>
  );
}
