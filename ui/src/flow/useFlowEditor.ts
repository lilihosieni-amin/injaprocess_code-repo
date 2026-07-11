import { useEffect, useRef, useState, useCallback } from 'react'
import type { Process, ActivityNode, JunctionNode } from '../api/types'
import { nextTempId } from './adapt'

type Pos = { x: number; y: number }
const clone = (p: Process): Process => JSON.parse(JSON.stringify(p))

export function useFlowEditor(server: Process | undefined) {
  const [doc, setDoc] = useState<Process | undefined>(server)
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const past = useRef<Process[]>([])
  const future = useRef<Process[]>([])
  const tmp = useRef(0)
  const [, force] = useState(0)

  // Keep the working copy in sync with the server doc while NOT editing.
  useEffect(() => {
    if (!editing && server) setDoc(server)
  }, [server, editing])

  const commit = useCallback((next: Process) => {
    if (doc) past.current.push(doc)
    future.current = []
    setDoc(next)
  }, [doc])

  const mutate = useCallback((fn: (d: Process) => void) => {
    if (!doc) return
    const next = clone(doc)
    fn(next)
    commit(next)
  }, [doc, commit])

  const enter = useCallback(() => { past.current = []; future.current = []; setEditing(true) }, [])
  const cancel = useCallback(() => { past.current = []; future.current = []; setEditing(false); if (server) setDoc(server) }, [server])
  const adopt = useCallback((next: Process) => { past.current = []; future.current = []; setDoc(next) }, [])

  const undo = useCallback(() => {
    if (!past.current.length || !doc) return
    future.current.push(doc)
    setDoc(past.current.pop()!)
    force((n) => n + 1)
  }, [doc])
  const redo = useCallback(() => {
    if (!future.current.length || !doc) return
    past.current.push(doc!)
    setDoc(future.current.pop()!)
    force((n) => n + 1)
  }, [doc])

  const setName = useCallback((name: string) => mutate((d) => { d.name = name }), [mutate])
  const moveNode = useCallback((id: string, pos: Pos) => mutate((d) => {
    const n = d.nodes.find((x) => x.id === id); if (n) { n.position = pos; n.layout = 'manual' }
  }), [mutate])

  const addActivity = useCallback(() => mutate((d) => {
    const id = nextTempId('n', ++tmp.current)
    const node: ActivityNode = { id, type: 'activity', label: 'فعالیت جدید', description: '', actor: '',
      icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null,
      position: { x: 120, y: 120 }, layout: 'manual', source: { created_by: 'ui-edit', touched_by: [] } }
    d.nodes.push(node)
  }), [mutate])

  const addJunction = useCallback(() => mutate((d) => {
    const id = nextTempId('j', ++tmp.current)
    const node: JunctionNode = { id, type: 'junction', junctionType: 'XOR', direction: 'split',
      position: { x: 160, y: 160 }, layout: 'manual' }
    d.nodes.push(node)
  }), [mutate])

  const connect = useCallback((from: string, to: string) => mutate((d) => {
    if (from === to) return
    if (!d.edges.some((e) => e.from === from && e.to === to)) d.edges.push({ from, to, label: '' })
  }), [mutate])

  const deleteEdge = useCallback((from: string, to: string) => mutate((d) => {
    d.edges = d.edges.filter((e) => !(e.from === from && e.to === to))
  }), [mutate])

  const deleteNode = useCallback((id: string) => mutate((d) => {
    const preds = d.edges.filter((e) => e.to === id).map((e) => e.from)
    const succs = d.edges.filter((e) => e.from === id).map((e) => e.to)
    d.edges = d.edges.filter((e) => e.from !== id && e.to !== id)
    for (const p of preds) for (const s of succs) {
      if (p !== s && !d.edges.some((e) => e.from === p && e.to === s)) d.edges.push({ from: p, to: s, label: '' })
    }
    d.nodes = d.nodes.filter((n) => n.id !== id)
  }), [mutate])

  const setJunction = useCallback((id: string, type: 'AND' | 'OR' | 'XOR') => mutate((d) => {
    const n = d.nodes.find((x) => x.id === id) as JunctionNode | undefined
    if (n && n.type === 'junction') n.junctionType = type
  }), [mutate])

  const patchActivity = useCallback((id: string, patch: Partial<Pick<ActivityNode, 'label' | 'actor' | 'description'>>) => mutate((d) => {
    const n = d.nodes.find((x) => x.id === id) as ActivityNode | undefined
    if (n && n.type === 'activity') Object.assign(n, patch)
  }), [mutate])

  const linkSub = useCallback((id: string, subId: string | null) => mutate((d) => {
    const n = d.nodes.find((x) => x.id === id) as ActivityNode | undefined
    if (n && n.type === 'activity') n.subprocess = subId
  }), [mutate])

  return {
    doc: doc as Process, editing, selected, select: setSelected,
    enter, cancel, adopt,
    canUndo: past.current.length > 0, canRedo: future.current.length > 0, undo, redo,
    setName, moveNode, addActivity, addJunction, connect, deleteEdge, deleteNode, setJunction, patchActivity, linkSub,
  }
}
