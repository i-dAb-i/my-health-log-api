from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    health_records: Mapped[list["HealthRecord"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class HealthRecord(Base):
    __tablename__ = "health_records"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        index=True,
    )

    weight: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    height: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    systolic: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    diastolic: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    blood_sugar: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    steps: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    step_grade: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    sleep_hours: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=0.0,
    )

    memo: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="",
    )

    bmi: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    bmi_category: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    bp_category: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    sugar_category: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    warnings: Mapped[list[str]] = mapped_column(
        JSON,
        nullable=False,
        default=list,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped["User"] = relationship(
        back_populates="health_records",
    )