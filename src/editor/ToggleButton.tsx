export default defineVaporComponent(({ text = '' }) => {
  let active = $defineModel<boolean>()

  return (
    <div class="wrapper" onClick={() => (active = !active)}>
      <span>{text}</span>
      <div class={['toggle', { active }]}>
        <div class="indicator" />
      </div>
    </div>
  )

  defineStyle(`
    .wrapper {
      display: flex;
      align-items: center;
      cursor: pointer;
      user-select: none;
    }
    
    .toggle {
      display: inline-block;
      margin-left: 4px;
      width: 32px;
      height: 18px;
      border-radius: 12px;
      position: relative;
      background-color: var(--border);
    }
    
    .indicator {
      font-size: 12px;
      background-color: var(--text-light);
      width: 14px;
      height: 14px;
      border-radius: 50%;
      transition: transform ease-in-out 0.2s;
      position: absolute;
      left: 2px;
      top: 2px;
      color: var(--bg);
      text-align: center;
    }
    
    .active .indicator {
      background-color: var(--color-branding);
      transform: translateX(14px);
      color: white;
    }
  `)
})
