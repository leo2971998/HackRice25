import React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

type Props = { children?: string; className?: string }

export function RichMarkdown({ children = "", className = "" }: Props) {
    return (
        <div
            className={[
                "prose prose-zinc dark:prose-invert max-w-none",
                "prose-p:my-2 prose-li:my-1 prose-headings:mt-3 prose-headings:mb-2",
                "prose-a:underline hover:prose-a:opacity-90",
                "prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:bg-muted",
                className,
            ].join(" ")}
        >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {children}
            </ReactMarkdown>
        </div>
    )
}
