import { VegaLiteChart } from './vega-lite-chart';
import { CodeBlock } from './code-block';

interface VegaCodeBlockProps {
  children: string;
  className?: string;
}

/**
 * Custom code block component for Vega-Lite specs in markdown
 * 
 * IMPORTANT: Always returns null to prevent duplicate chart rendering.
 * Charts are already rendered from tool output, so we don't need to
 * render them again from markdown code blocks.
 */
export const VegaCodeBlock = ({ children, className }: VegaCodeBlockProps) => {
  // Always return null - charts are rendered from tool output, not markdown
  // This prevents duplicate charts when LLM outputs the spec as text
  return null;
};
