import { useCallback, useMemo, useState } from 'react';
import ReactFlow, {
  addEdge,
  ConnectionLineType,
  Panel,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  Connection,
  Position,
  useReactFlow,
  useStoreApi,
} from 'reactflow';
import dagre from 'dagre';

import 'reactflow/dist/style.css';
import { Route } from '../../types';
import { Icon } from './Icons';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 172;
const nodeHeight = 36;

function getRandomColor() {
  const colors = ['#1abc9c', '#2ecc71', '#3498db', '#9b59b6', '#f1c40f', '#e67e22', '#e74c3c'];

  const colorIndex = Math.floor(Math.random() * colors.length);

  return colors[colorIndex]!;
}

function lightenColor(hex: string, level = 1) {
  // Remove the hash at the start if it's there
  hex = hex.replace(/^#/, '');

  // Parse the hex color into RGB components
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);

  // Increase each component by the given percentage
  r = Math.min(255, Math.floor(r * (1 + (level * 5) / 100)));
  g = Math.min(255, Math.floor(g * (1 + (level * 5) / 100)));
  b = Math.min(255, Math.floor(b * (1 + (level * 5) / 100)));

  // Convert the RGB components back to a hex string
  const newColor = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;

  return newColor;
}

function getNodesAndEdges(
  routes: Route,
  nodes: Node[] = [],
  edges: Edge[] = [],
  parent?: { id: string, color: string },
  level = 0
) {
  const nodeId = String(nodes.length + 1);

  const color = !parent ? 'blue' : level > 1 ? parent.color : getRandomColor();

  nodes.push({
    id: nodeId,
    type: !parent ? 'input' : undefined,
    data: { label: routes.name },
    position: { x: 0, y: 0 },
    className: `font-bold border-2 ${parent ? 'bg-gray-100' : 'bg-blue-600 text-white'}`,
    style: {
      borderColor: color
    }
  });

  const children = Object.values(routes.children);

  children.forEach(child => {
    if (child.type !== 'route') return;

    const from = nodeId;
    const to = String(nodes.length + 1);

    edges.push({
      id: `e${from}${to}`,
      source: from,
      target: to,
      type: 'smoothstep',
      animated: true,
      style: {
        stroke: parent ? color : 'black'
      }
    });

    getNodesAndEdges(child, nodes, edges, { id: nodeId, color }, level + 1);
  });

  return { nodes, edges };
}

function getLayoutedNodesAndEdges(nodes: Node[], edges: Edge[], direction = 'TB') {
  const isHorizontal = direction === 'LR';

  dagreGraph.setGraph({
    rankdir: direction, // Direction for rank nodes. Can be TB, BT, LR, or RL, where T = top, B = bottom, L = left, and R = right.
    align: undefined, // Alignment for rank nodes. Can be UL, UR, DL, or DR, where U = up, D = down, L = left, and R = right.
    nodesep: 25, // Number of pixels that separate nodes horizontally in the layout.
    edgesep: 10, // Number of pixels that separate edges horizontally in the layout.
    ranksep: 50, // Number of pixels between each rank in the layout.
    marginx: 0, // Number of pixels to use as a margin around the left and right of the graph.
    marginy: 0, // Number of pixels to use as a margin around the top and bottom of the graph.
    acyclicer: 'greedy', // If set to greedy, uses a greedy heuristic for finding a feedback arc set for a graph. A feedback arc set is a set of edges that can be removed to make a graph acyclic.
    ranker: 'network-simplex', // Type of algorithm to assigns a rank to each node in the input graph. Possible values: network-simplex, tight-tree or longest-path
  });

  nodes.forEach((node) => dagreGraph.setNode(node.id, {
    width: nodeWidth,
    height: nodeHeight
  }));

  edges.forEach((edge) => dagreGraph.setEdge(edge.source, edge.target));

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = isHorizontal ? Position.Left : Position.Top;
    node.sourcePosition = isHorizontal ? Position.Right : Position.Bottom;

    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };

    return node;
  });

  return { nodes, edges };
};

type GraphDirection = 'TB' | 'BT' | 'LR' | 'RL';

interface RouteGraphProps {
  route: Route;
}

export function RouteGraph({ route }: RouteGraphProps) {
  const layouted = useMemo(() => {
    const { nodes, edges } = getNodesAndEdges(route);

    const layouted = getLayoutedNodesAndEdges(nodes, edges, 'TB');

    return layouted;
  }, [route.id]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layouted.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layouted.edges);

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge({ ...params, type: ConnectionLineType.SmoothStep, animated: true }, eds)
      ),
    []
  );

  const onLayout = useCallback(
    (direction: GraphDirection) => {
      const { nodes, edges } = getNodesAndEdges(route);

      const layouted = getLayoutedNodesAndEdges(nodes, edges, direction);

      setNodes([...layouted.nodes]);
      setEdges([...layouted.edges]);
    },
    [nodes, edges]
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      connectionLineType={ConnectionLineType.SmoothStep}
      fitView
      minZoom={0}
    >
      <RouteGraphPanel onDirection={(dir) => onLayout(dir)} />
    </ReactFlow>
  );
};

interface RouteGraphPanelProps {
  onDirection: (direction: GraphDirection) => void;
}

function RouteGraphPanel({ onDirection }: RouteGraphPanelProps) {
  const store = useStoreApi();
  const { setCenter } = useReactFlow();

  const focusNode = () => {
    const { nodeInternals } = store.getState();

    const rootNode = [...nodeInternals.values()][0]!;

    const zoom = 0.5;

    setCenter(rootNode.position.x, rootNode.position.y, { zoom, duration: 1000 });
  };

  function handleDescription(dir: GraphDirection) {
    onDirection(dir);
    setTimeout(() => focusNode(), 0)
  }

  return (
    <Panel position="top-left" className="bg-white shadow-md m-1 p-2 border-[1px] rounded-md border-gray-200 w-48">
      <p className="font-bold text-gray-800 bg-">Controls</p>
      <div className="h-[1px] w-full bg-gray-100 mb-2"></div>
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-800">Direction</p>
          <div className="flex gap-2">
            <button
              onClick={() => handleDescription('TB')}
              className="p-2 rounded-lg text-sm bg-gray-100 hover:bg-gray-200 data-[active=true]:bg-gray-900 data-[active=true]:text-white transition-all duration-200"
            >
              <Icon name="arrowRight" className="h-4 w-4 rotate-90" />
            </button>
            <button
              onClick={() => handleDescription('LR')}
              className="p-2 rounded-lg text-sm bg-gray-100 hover:bg-gray-200 data-[active=true]:bg-gray-900 data-[active=true]:text-white transition-all duration-200"
            >
              <Icon name="arrowRight" className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </Panel>
  )
}