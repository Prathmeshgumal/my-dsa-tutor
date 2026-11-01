import type { ComponentProps, ReactNode } from 'react';
import { Link } from 'react-router';
import Callout from './Callout';
import WeekendPlan from './WeekendPlan';
import UpiFlow from './UpiFlow';
import DoubleTapDemo from './DoubleTapDemo';
import LedgerDemo from './LedgerDemo';
import MoneyMap from './MoneyMap';
import RaceDemo from './RaceDemo';
import InFlightTimeline from './InFlightTimeline';
import ReconcileDemo from './ReconcileDemo';
import LedgerNotebook from './LedgerNotebook';
import BankVsWallet from './BankVsWallet';
import EscrowBox from './EscrowBox';
import DeadlockDemo from './DeadlockDemo';
import PostFlow from './PostFlow';
import TxGotcha from './TxGotcha';
import AsyncTimeline from './AsyncTimeline';
import NamesDiagram from './NamesDiagram';
import AttributeLookup from './AttributeLookup';
import ConnString from './ConnString';
import DbMap from './DbMap';
import PoolDemo from './PoolDemo';
import ProcessList from './ProcessList';
import HttpAnatomy from './HttpAnatomy';
import KeyLifecycle from './KeyLifecycle';
import PayScreens from './PayScreens';
import NoReply from './NoReply';
import AgentLoop from './AgentLoop';
import AgentFence from './AgentFence';
import SystemMap from './arch/SystemMap';
import BackendLayers from './arch/BackendLayers';
import DataModel from './arch/DataModel';
import Sequence from './arch/Sequence';
import PaymentDecision from './arch/PaymentDecision';
import StateMachines from './arch/StateMachines';

// Internal links use the router (no full reload); external ones open in a new tab.
function A({ href = '', ...props }: ComponentProps<'a'>) {
  if (href.startsWith('/')) return <Link to={href} {...props} />;
  if (href.startsWith('#')) return <a href={href} {...props} />;
  return <a href={href} target="_blank" rel="noopener noreferrer" {...props} />;
}

// Components available in every .mdx file without importing them.
export const mdxComponents = {
  a: A,
  Callout,
  WeekendPlan,
  UpiFlow,
  DoubleTapDemo,
  LedgerDemo,
  MoneyMap,
  RaceDemo,
  InFlightTimeline,
  ReconcileDemo,
  LedgerNotebook,
  BankVsWallet,
  EscrowBox,
  DeadlockDemo,
  PostFlow,
  TxGotcha,
  AsyncTimeline,
  NamesDiagram,
  AttributeLookup,
  ConnString,
  DbMap,
  PoolDemo,
  ProcessList,
  HttpAnatomy,
  KeyLifecycle,
  PayScreens,
  NoReply,
  AgentLoop,
  AgentFence,
  SystemMap,
  BackendLayers,
  DataModel,
  Sequence,
  PaymentDecision,
  StateMachines,
} satisfies Record<string, (props: any) => ReactNode>;
