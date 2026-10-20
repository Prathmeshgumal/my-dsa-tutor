import type { DryRun, DryRunStep } from './dryRun'

const CODE = `void bubbleSort(vector<int>& arr) {
    int n = arr.size();
    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - 1 - i; j++) {
            if (arr[j] > arr[j + 1]) {
                swap(arr[j], arr[j + 1]);
            }
        }
    }
}`

/** A real bubble sort, traced step by step: a demo of the Playground that needs no Claude. */
export function exampleDryRun(): DryRun {
  const arr = [5, 2, 4, 1]
  const n = arr.length
  const done: number[] = []
  const steps: DryRunStep[] = []
  const snap = (line: number, note: string, vars: Record<string, number>, extra: { highlight?: number[]; swapped?: number[] } = {}) =>
    steps.push({
      line,
      note,
      vars,
      structures: [{ kind: 'array', name: 'arr', values: [...arr], pointers: 'j' in vars ? { j: vars.j, 'j+1': vars.j + 1 } : {}, done: [...done], ...extra }],
    })

  snap(2, `n = ${n}: the array has ${n} elements.`, { n })
  for (let i = 0; i < n - 1; i++) {
    snap(3, `Pass ${i + 1}: the largest unsorted value will bubble to index ${n - 1 - i}.`, { n, i })
    for (let j = 0; j < n - 1 - i; j++) {
      const bigger = arr[j] > arr[j + 1]
      snap(5, `Compare arr[${j}] = ${arr[j]} with arr[${j + 1}] = ${arr[j + 1]}: ${bigger ? 'out of order' : 'already in order'}.`, { n, i, j }, { highlight: [j, j + 1] })
      if (bigger) {
        ;[arr[j], arr[j + 1]] = [arr[j + 1], arr[j]]
        snap(6, `Swap them: now arr[${j}] = ${arr[j]}, arr[${j + 1}] = ${arr[j + 1]}.`, { n, i, j }, { swapped: [j, j + 1] })
      }
    }
    done.push(n - 1 - i)
    snap(3, `End of pass ${i + 1}: ${arr[n - 1 - i]} is in its final place.`, { n, i })
  }
  done.push(0)
  steps.push({ line: 10, note: 'Sorted.', vars: { n }, structures: [{ kind: 'array', name: 'arr', values: [...arr], done: [...done] }] })

  return { id: 'example-bubble-sort', title: 'Example: bubble sort on [5, 2, 4, 1]', language: 'cpp', code: CODE, input: '[5, 2, 4, 1]', createdAt: 0, steps }
}
