import { useState, useRef } from 'react';
import { VegaEmbed } from 'react-vega';
import type { VisualizationSpec, Result } from 'vega-embed';
import { Button } from '@/components/ui/button';
import { Download, Code2, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CodeBlock } from './code-block';

interface VegaLiteChartProps {
  spec: VisualizationSpec;
  className?: string;
}

export const VegaLiteChart = ({ spec, className }: VegaLiteChartProps) => {
  const [showSpec, setShowSpec] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vegaResultRef = useRef<Result | null>(null);

  const handleEmbed = (result: Result) => {
    vegaResultRef.current = result;
  };

  const handleError = (err: unknown) => {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Vega-Lite rendering error:', err);
    setError(errorMessage);
  };

  const handleDownloadPNG = async () => {
    if (vegaResultRef.current?.view) {
      try {
        const imageUrl = await vegaResultRef.current.view.toImageURL('png');
        const a = document.createElement('a');
        a.href = imageUrl;
        a.download = 'chart.png';
        a.click();
      } catch (err) {
        console.error('Error downloading PNG:', err);
      }
    }
  };

  const handleDownloadSVG = async () => {
    if (vegaResultRef.current?.view) {
      try {
        const svg = await vegaResultRef.current.view.toSVG();
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'chart.svg';
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Error downloading SVG:', err);
      }
    }
  };

  if (error) {
    return (
      <div className="space-y-2">
        <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950">
          <p className="font-medium text-red-800 text-sm dark:text-red-200">
            Failed to render visualization
          </p>
          <p className="mt-1 text-red-600 text-xs dark:text-red-400">{error}</p>
        </div>
        <div className="text-muted-foreground text-xs">
          <CodeBlock code={JSON.stringify(spec, null, 2)} language="json" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Chart Actions */}
      <div className="flex items-center justify-between gap-2 border-b pb-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSpec(!showSpec)}
            className="h-7 gap-1 px-2 text-xs"
          >
            {showSpec ? (
              <>
                <Eye className="size-3" />
                Show Chart
              </>
            ) : (
              <>
                <Code2 className="size-3" />
                View Spec
              </>
            )}
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownloadPNG}
            className="h-7 gap-1 px-2 text-xs"
            title="Download as PNG"
          >
            <Download className="size-3" />
            PNG
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownloadSVG}
            className="h-7 gap-1 px-2 text-xs"
            title="Download as SVG"
          >
            <Download className="size-3" />
            SVG
          </Button>
        </div>
      </div>

      {/* Chart or Spec View */}
      {showSpec ? (
        <div className="rounded-md border bg-muted/50">
          <CodeBlock code={JSON.stringify(spec, null, 2)} language="json" />
        </div>
      ) : (
        <div className="flex items-center justify-center rounded-md border bg-background p-4">
          <VegaEmbed
            spec={spec}
            options={{
              actions: false,
              renderer: 'svg',
            }}
            onEmbed={handleEmbed}
            onError={handleError}
          />
        </div>
      )}
    </div>
  );
};
