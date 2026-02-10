import { type ComponentProps, memo } from 'react';
import { DatabricksMessageCitationStreamdownIntegration } from '../databricks-message-citation';
import { Streamdown } from 'streamdown';
import { VegaCodeBlock } from './vega-code-block';

type ResponseProps = ComponentProps<typeof Streamdown>;

export const Response = memo(
  (props: ResponseProps) => {
    return (
      <Streamdown
        components={{
          a: DatabricksMessageCitationStreamdownIntegration,
          code: ({ className, children, ...props }) => {
            // Check if this is a vega-lite code block
            const language = className?.replace('language-', '');
            
            if (language === 'vega-lite') {
              return <VegaCodeBlock className={className}>{String(children)}</VegaCodeBlock>;
            }
            
            // For other code blocks, use default rendering
            return <code className={className} {...props}>{children}</code>;
          },
          img: ({ src, alt, ...props }) => {
            // Filter out vegalab.app image URLs - we render Vega charts directly
            // The LLM sometimes outputs these as markdown images which would be redundant
            if (src?.includes('vegalab.app')) {
              return null;
            }
            
            // For other images, use default rendering
            return <img src={src} alt={alt} {...props} />;
          },
        }}
        className="flex flex-col gap-4"
        {...props}
      />
    );
  },
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);

Response.displayName = 'Response';
