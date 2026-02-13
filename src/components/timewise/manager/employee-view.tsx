"use client";

import React, { useState } from 'react';
import type { Employee, Site } from '@/shared/types/domain';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle, Trash2, Edit } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EmployeeProfileDialog } from '../employee-profile';

interface EmployeeManagerViewProps {
    employees: Employee[];
    addEmployee: (employee: Omit<Employee, 'id'>) => void;
    updateEmployee: (id: string, updates: Partial<Employee>) => Promise<void>;
    deleteEmployee: (id: string) => Promise<void>;
}

export function EmployeeManagerView({ employees, addEmployee, updateEmployee, deleteEmployee }: EmployeeManagerViewProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

    const handleOpenDialog = (employee: Employee | null = null) => {
        setEditingEmployee(employee);
        setIsDialogOpen(true);
    };

    const handleAddEmployee = (newEmployeeData: Omit<Employee, 'id'>) => {
        addEmployee(newEmployeeData);
        setIsDialogOpen(false);
    };
    
    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>Manage Employees</CardTitle>
                        <CardDescription>Add, edit, or remove employees and set their roles and pay rates.</CardDescription>
                    </div>
                    <Button onClick={() => handleOpenDialog()}>
                        <PlusCircle className="mr-2 h-4 w-4" /> Add Employee
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-96">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Phone</TableHead>
                                <TableHead>Default Rate</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(employees || []).length > 0 ? (
                                employees.sort((a,b) => a.name.localeCompare(b.name)).map(emp => (
                                    <TableRow key={emp.id}>
                                        <TableCell>
                                            <span className="flex items-center gap-2 font-medium">
                                                {emp.color && <span className="w-3 h-3 rounded-full" style={{backgroundColor: emp.color}}></span>}
                                                {emp.name}
                                            </span>
                                            <span className="text-muted-foreground text-xs">{emp.title}</span>
                                        </TableCell>
                                        <TableCell>{emp.phone || '-'}</TableCell>
                                        <TableCell>${emp.payRate.toFixed(2)}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(emp)}>
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => deleteEmployee(emp.id)}>
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">No employees yet.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </CardContent>

            {isDialogOpen && (
                <EmployeeProfileDialog
                    isOpen={isDialogOpen}
                    onOpenChange={setIsDialogOpen}
                    employee={editingEmployee}
                    updateEmployee={async (id, updates) => {
  updateEmployee(id, updates);
}}
 addEmployee={async (employee) => {
    addEmployee(employee);
  }}

                    mode="manager"
                />
            )}
        </Card>
    );
}
