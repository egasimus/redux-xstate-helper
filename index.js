import { Machine } from 'xstate'

export default class FSM {

  constructor (args) {
    const {
      name,
      source = [[]],
      effects = {},
      initial = source[0][0],
      selector = state=>state[name],
      getChildKey
    } = args

    this.name = name
    this.selectFromRoot = selector
    this.getChildKey = getChildKey
    this.effects = effects
    this.initial = initial
    this.TRANSITION = `@@${name}/TRANSITION`

    const { actions, states, chart } = this.createChart(source)
    this.actions = actions
    this.states = states
    this.machine = Machine({ key: name, initial, states: chart })
    this.reducer = this.createReducer()
    this.middleware = this.createMiddleware()
  }

  createChart (source) {
    let actions = new Set(), states = new Set()
    const chart = source.reduce((chart, [state, action, newState])=>{
      if (action && newState) {
        action = `${this.name}/${action}`
        actions.add(action)
        states.add(state)
        states.add(newState)
        chart[state] = chart[state] || { on: {} }
        chart[state].on[action] = newState
        chart[newState] = chart[newState] || { on: {} }
      }
      return chart
    }, {})
    actions = toEnum(actions)
    states = toEnum(states)
    return { actions, states, chart }
  }

  createMiddleware () {
    return ({ dispatch, getState }) => next => action => {
      if (action.type.startsWith(`${this.name}/`)) {
        state = this.selectFromRoot(getState())
        state = this.selectChildState(state, action)
        const current = state.value
        if (this.isTransition(action)) {
          const nextState = this.machine.transition(current, action, state)
          dispatch({ type: this.TRANSITION, payload: nextState })
          if (this.effects[action.type]) {
            this.effects[action.type](dispatch, action, nextState, state)
          }
          this.log(current, action, nextState.value)
        } else {
          console.log(`not a transition from ${current}: ${action.type}`)
        }
      }
      return next(action)
    }
  }

  selectChildState (state, action) {
    if (!this.getChildKey) return state
    state = state[this.getChildKey(action)]
    if (!state) state = { value: 'INIT' }
    return state
  }

  createReducer () {
    const initialState =
      this.getChildKey
        ? {}
        : { value: this.initial }
    return (state = initialState, action) => {
      if (action.type === this.TRANSITION) {
        if (!this.getChildKey) {
          return action.payload
        } else {
          const key = this.getChildKey(action.payload.event)
          return { ...state, [key]: action.payload }
        }
      }
      return state
    }
  }

  log (current, action, next) {
    if (next === current) {
      next = '🛑'
      // console.warn(`🛑 ${current} -> ${action.type} not allowed`)
    }
    const { type, ...rest } = action
    let output = `\nFSM [${this.name}]`
    if (this.getChildKey) output += ` [${this.getChildKey(action)}]`
    output += `\n${current}`
    output += `\n  -> ${type} ${JSON.stringify(rest, null, 2).replace(/\n/g, '\n  ')}`
    output += `\n  -> ${next}`
    output += `\n`
    console.log(output)
  }

  isTransition ({ type }) {
    const { states } = this.machine.config
    const validActions = Object.keys(states)
      .map(key => [
        ...(states[key].states ? getActions(states[key].states) : []),
        ...Object.keys(states[key].on || {})
      ])
      .reduce((a, b) => a.concat(b), [])
      .filter((key, pos, arr) => arr.indexOf(key) === pos)
    return validActions.includes(type)
  }

}

function toEnum (set) {
  return [...set].reduce((obj, value)=>({ ...obj, [value]: value }), {})
}