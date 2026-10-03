"""Deterministic SYNTHETIC fraud data for the hackathon prototype.

Nothing here is real banking data. Customer behaviour and attack patterns are invented, so any
metric computed on this data says how well the model separates *these simulated patterns*, not
how it would perform at a real bank.

Scenarios (label 1 unless noted):
  normal            ordinary payments (label 0)
  legit_large       unusually large but legitimate payments to a new payee (label 0, hard negative)
  high_value        large payment far above the customer's baseline to a new payee
  new_payee_night   unusual amount, at night, new device, high-risk IP
  micro_burst       several tiny transfers to one new payee, then a large one
  mule_ring         transfers inside / into a ring sharing a device and IP
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid5

import numpy as np

from app.features.config import GRAPH_MAX_HOPS, GRAPH_NO_CONNECTION
from app.graph.reference import Node, account, transaction_hops
from app.schemas.transaction import TransactionEvent

TENANT_ID = UUID("00000000-0000-4000-8000-0000000000d1")
_NAMESPACE = UUID("00000000-0000-4000-8000-0000000000d2")
START = datetime(2026, 6, 1, tzinfo=UTC)
DAYS = 60
FIRST_ATTACK_DAY = 15
HIGH_RISK_IP_PREFIX = "203.0.113."
HOME_IP_POOLS = (  # (prefix, weight) -> low, unlisted, medium, internal risk tables
    ("192.0.2.", 0.35),
    ("8.8.4.", 0.30),
    ("198.51.100.", 0.20),
    ("10.20.30.", 0.15),
)
OUTAGE_RATE = 0.05  # share of rows whose graph lookup is simulated as unavailable (-1)
LEGIT_LARGE_RATE = 0.01
KNOWN_RINGS = 4
TOTAL_RINGS = 6


@dataclass(frozen=True)
class LabeledEvent:
    event: TransactionEvent
    label: int
    scenario: str
    graph_hops: int | None  # None = simulated graph outage


@dataclass(frozen=True)
class _Customer:
    id: str
    mean_amount: float
    sigma: float
    active_hour: float
    rate: float
    beneficiaries: tuple[str, ...]
    devices: tuple[str, ...]
    ip_prefix: str
    ip_last: int
    channels: tuple[str, ...]
    channel_p: tuple[float, ...]


class _Generator:
    def __init__(self, seed: int, n_customers: int) -> None:
        self.seed = seed
        self.rng = np.random.default_rng(seed)
        self.events: list[tuple[TransactionEvent, int, str]] = []
        self.counter = 0
        self.customers = [self._customer(i) for i in range(n_customers)]

    # -- helpers -----------------------------------------------------------------------------
    def _customer(self, index: int) -> _Customer:
        rng = self.rng
        prefixes = [p for p, _ in HOME_IP_POOLS]
        weights = np.array([w for _, w in HOME_IP_POOLS])
        n_ben = int(rng.integers(2, 6))
        return _Customer(
            id=f"cust-{index:04d}",
            mean_amount=float(np.exp(rng.normal(math.log(120), 0.7))),
            sigma=float(rng.uniform(0.25, 0.5)),
            active_hour=float(rng.uniform(9, 20)),
            rate=float(rng.uniform(0.8, 2.5)),
            beneficiaries=tuple(f"payee-{index:04d}-{k}" for k in range(n_ben)),
            devices=tuple(f"device-{index:04d}-{k}" for k in range(int(rng.integers(1, 3)))),
            ip_prefix=str(rng.choice(prefixes, p=weights / weights.sum())),
            ip_last=int(rng.integers(2, 250)),
            channels=("mobile", "web", "atm", "branch"),
            channel_p=(0.55, 0.30, 0.10, 0.05),
        )

    def _add(
        self,
        ts: datetime,
        sender: str,
        receiver: str,
        amount: float,
        channel: str,
        device: str | None,
        ip: str | None,
        label: int,
        scenario: str,
    ) -> None:
        self.counter += 1
        event = TransactionEvent(
            tenant_id=TENANT_ID,
            transaction_id=uuid5(_NAMESPACE, f"{self.seed}-{self.counter}"),
            from_account_id=sender,
            to_account_id=receiver,
            amount=max(round(amount, 2), 0.01),
            currency="USD",
            channel=channel,
            device_id=device,
            ip_address=ip,
            timestamp=ts,
        )
        self.events.append((event, label, scenario))

    def _when(self, day: int, hour: float) -> datetime:
        minute = float(self.rng.uniform(0, 60))
        return START + timedelta(days=day, hours=int(hour) % 24, minutes=minute)

    def _customer_ip(self, c: _Customer) -> str:
        return f"{c.ip_prefix}{c.ip_last}"

    def _attacker_ip(self, c: _Customer, p_high_risk: float = 0.65) -> str:
        if self.rng.random() < p_high_risk:
            return f"{HIGH_RISK_IP_PREFIX}{int(self.rng.integers(2, 250))}"
        return self._customer_ip(c)

    def _pick(self, items: tuple[str, ...]) -> str:
        return str(items[int(self.rng.integers(0, len(items)))])

    # -- scenarios ---------------------------------------------------------------------------
    def normal_activity(self) -> None:
        rng = self.rng
        for c in self.customers:
            for day in range(DAYS):
                for _ in range(int(rng.poisson(c.rate))):
                    hour = float(rng.normal(c.active_hour, 3.0)) % 24
                    amount = float(np.exp(rng.normal(math.log(c.mean_amount), c.sigma)))
                    channel = str(rng.choice(c.channels, p=c.channel_p))
                    device = self._pick(c.devices) if rng.random() < 0.97 else None
                    ip = self._customer_ip(c) if rng.random() < 0.95 else None
                    ts = self._when(day, hour)
                    if rng.random() < LEGIT_LARGE_RATE:
                        self._add(
                            ts, c.id, f"shop-{int(rng.integers(0, 10_000)):05d}",
                            amount * float(rng.uniform(4, 10)), channel, device, ip, 0,
                            "legit_large",
                        )  # fmt: skip
                    elif rng.random() < 0.08:
                        self._add(
                            ts, c.id, f"peer-{int(rng.integers(0, 10_000)):05d}",
                            amount, channel, device, ip, 0, "normal",
                        )  # fmt: skip
                    else:
                        self._add(
                            ts, c.id, self._pick(c.beneficiaries), amount, channel, device, ip,
                            0, "normal",
                        )  # fmt: skip

    def high_value(self, n: int) -> None:
        for k in range(n):
            c = self._pick_customer()
            day = int(self.rng.integers(FIRST_ATTACK_DAY, DAYS))
            fresh_device = self.rng.random() < 0.6
            self._add(
                self._when(day, float(self.rng.uniform(0, 24))), c.id, f"mule-solo-{k:04d}",
                c.mean_amount * float(self.rng.uniform(8, 20)),
                str(self.rng.choice(["web", "mobile"])),
                f"device-ato-{k:04d}" if fresh_device else self._pick(c.devices),
                self._attacker_ip(c), 1, "high_value",
            )  # fmt: skip

    def new_payee_night(self, n: int) -> None:
        for k in range(n):
            c = self._pick_customer()
            day = int(self.rng.integers(FIRST_ATTACK_DAY, DAYS))
            self._add(
                self._when(day, float(self.rng.uniform(0, 5))), c.id, f"mule-night-{k:04d}",
                c.mean_amount * float(self.rng.uniform(3, 8)),
                str(self.rng.choice(["web", "atm"])),
                f"device-night-{k:04d}", self._attacker_ip(c, 0.8), 1, "new_payee_night",
            )  # fmt: skip

    def micro_burst(self, n: int) -> None:
        for k in range(n):
            c = self._pick_customer()
            day = int(self.rng.integers(FIRST_ATTACK_DAY, DAYS))
            start = self._when(day, float(self.rng.uniform(0, 24)))
            device, ip, mule = (
                f"device-burst-{k:04d}",
                self._attacker_ip(c, 0.8),
                f"mule-burst-{k:04d}",
            )
            for step in range(6):
                self._add(
                    start + timedelta(minutes=1.5 * step), c.id, mule,
                    float(self.rng.uniform(1, 25)), "mobile", device, ip, 1, "micro_burst",
                )  # fmt: skip
            self._add(
                start + timedelta(minutes=10), c.id, mule,
                c.mean_amount * float(self.rng.uniform(4, 10)), "mobile", device, ip, 1,
                "micro_burst",
            )  # fmt: skip

    def mule_rings(self) -> list[str]:
        """Returns the account ids of rings that are *known* (flagged) to the graph."""
        known: list[str] = []
        for r in range(TOTAL_RINGS):
            members = [f"mule-r{r}-{j}" for j in range(3)]
            device, ip = f"ring-dev-{r}", f"{HIGH_RISK_IP_PREFIX}{10 + r}"
            if r < KNOWN_RINGS:
                known.extend(members)
            for _ in range(10):  # internal shuffling / cash-out
                a, b = self.rng.choice(3, size=2, replace=False)
                day = int(self.rng.integers(FIRST_ATTACK_DAY, DAYS))
                self._add(
                    self._when(day, float(self.rng.uniform(0, 24))), members[int(a)],
                    members[int(b)], float(self.rng.uniform(200, 3000)), "mobile", device, ip,
                    1, "mule_ring",
                )  # fmt: skip
            for _ in range(8):  # victims paying into the ring
                c = self._pick_customer()
                day = int(self.rng.integers(FIRST_ATTACK_DAY, DAYS))
                self._add(
                    self._when(day, float(self.rng.uniform(8, 23))), c.id,
                    members[int(self.rng.integers(0, 3))],
                    c.mean_amount * float(self.rng.uniform(2, 6)), "mobile",
                    self._pick(c.devices), self._customer_ip(c), 1, "mule_ring",
                )  # fmt: skip
        return known

    def _pick_customer(self) -> _Customer:
        return self.customers[int(self.rng.integers(0, len(self.customers)))]


def generate(seed: int = 42, n_customers: int = 300) -> list[LabeledEvent]:
    """Build the full labeled dataset, ordered by time. Fully determined by ``seed``."""
    gen = _Generator(seed, n_customers)
    gen.normal_activity()
    gen.high_value(80)
    gen.new_payee_night(60)
    gen.micro_burst(40)
    known_ring_accounts = gen.mule_rings()

    ordered = sorted(gen.events, key=lambda e: (e[0].timestamp, str(e[0].transaction_id)))
    adjacency: dict[Node, set[Node]] = defaultdict(set)
    flagged = {account(a) for a in known_ring_accounts}
    outage_rng = np.random.default_rng(seed + 1)

    labeled: list[LabeledEvent] = []
    for event, label, scenario in ordered:
        hops = transaction_hops(
            adjacency, flagged, event.from_account_id, event.to_account_id,
            GRAPH_MAX_HOPS, GRAPH_NO_CONNECTION,
        )  # fmt: skip
        outage = bool(outage_rng.random() < OUTAGE_RATE)
        labeled.append(LabeledEvent(event, label, scenario, None if outage else hops))
        # Sync the event into the graph the way app.graph.sync does, after scoring.
        src, dst = account(event.from_account_id), account(event.to_account_id)
        adjacency[src].add(dst)
        adjacency[dst].add(src)
        if event.device_id:
            dev: Node = ("dev", event.device_id)
            adjacency[src].add(dev)
            adjacency[dev].add(src)
        if event.ip_address:
            ip: Node = ("ip", event.ip_address)
            adjacency[src].add(ip)
            adjacency[ip].add(src)
    return labeled
