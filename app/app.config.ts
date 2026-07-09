export default defineAppConfig({
  ui: {
    colors: {
      primary: 'voltage',
      neutral: 'zinc',
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
        base: 'font-semibold rounded-lg'
      },
      defaultVariants: {
        color: 'primary',
        size: 'md'
      }
    },
    badge: {
      slots: {
        base: 'rounded-full font-medium'
      }
    },
    card: {
      slots: {
        root: 'rounded-xl bg-muted shadow-none ring-1 ring-default'
      }
    },
    input: {
      slots: {
        base: 'rounded-lg bg-muted'
      }
    },
    select: {
      slots: {
        base: 'rounded-lg bg-muted'
      }
    },
    tabs: {
      slots: {
        trigger: 'rounded-lg'
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
