export default defineAppConfig({
  ui: {
    colors: {
      primary: 'linkedin',
      neutral: 'slate',
      info: 'sky',
      success: 'emerald',
      warning: 'amber',
      error: 'rose'
    },
    icons: {
      loading: 'i-lucide-loader-circle'
    },
    button: {
      slots: {
        base: 'font-semibold rounded-md'
      },
      defaultVariants: {
        color: 'primary',
        size: 'md'
      }
    },
    badge: {
      slots: {
        base: 'rounded-sm font-medium'
      }
    },
    card: {
      slots: {
        root: 'rounded-lg shadow-sm ring-1 ring-default'
      }
    },
    input: {
      slots: {
        base: 'rounded-md'
      }
    },
    select: {
      slots: {
        base: 'rounded-md'
      }
    },
    tabs: {
      slots: {
        trigger: 'rounded-md'
      }
    },
    table: {
      slots: {
        th: 'text-xs font-semibold uppercase tracking-normal text-muted',
        td: 'text-sm'
      }
    }
  }
})
